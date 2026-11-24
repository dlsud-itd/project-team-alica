import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  CheckpointType,
  Event,
  EventApprovalStatus,
  Prisma,
  TicketType,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import {
  evaluateCheckpointScan,
  resolveCheckpointCooldownSeconds,
} from '../checkpoints/checkpoint-scan.evaluator.js';
import {
  computeEventProgress,
  computeProgressSummaryForCode,
  type ProgressSummaryDto,
  type RegistrantProgressDto,
} from '../checkpoints/ticket-progress.js';
import {
  euclideanDistance,
  FACE_MATCH_THRESHOLD,
} from '../checkpoints/checkpoints.service.js';
import { GuestInvitationMailer } from './guest-invitation-mailer.service.js';
import { generateTicketCode } from '../../common/ticket-code.js';
import {
  normalizeCategoryName,
  STANDARD_EVENT_CATEGORIES,
  type CategoryDefinition,
} from '../../common/constants/event-taxonomy.constants.js';

const MAX_GUEST_ROWS = 5000;
const DEFAULT_GUEST_AFFILIATION = 'Guest / Imported Attendee';
const TEMP_PASSWORD_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export interface GuestImportFile {
  originalname: string;
  buffer: Buffer;
}

export interface GuestFilePreviewDto {
  fileName: string;
  totalRows: number;
  detectedHeaders: string[];
  sampleRows: string[][];
}

export interface GuestImportMappingDto {
  hasHeaders?: boolean;
  nameMode?: 'single' | 'split';
  fullNameColumn?: string | number;
  firstNameColumn?: string | number;
  lastNameColumn?: string | number;
  emailColumn?: string | number;
  studentIdColumn?: string | number;
  contactNumberColumn?: string | number;
  affiliationColumn?: string | number;
}

interface ParsedGuest {
  row: number;
  fullName?: string;
  firstName: string;
  lastName: string;
  email: string;
  studentId?: string | null;
  contactNumber?: string | null;
  affiliation: string;
}

export interface GuestImportResult {
  created: Array<{
    id: string;
    email: string;
    fullName: string;
    ticketId: string;
    ticketCode: string;
    emailStatus: 'SENT' | 'FAILED';
  }>;
  skipped: Array<{ row: number; email?: string; reason: string }>;
  emailFailures: string[];
  summary: {
    created: number;
    skipped: number;
    emailFailures: number;
  };
  credentials?: Array<{ email: string; temporaryPassword: string }>;
}

export interface EventResponseDto {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  tags: string[];
  dateLabel: string;
  timeLabel: string;
  venue: string;
  spotsTotal: number;
  spotsTaken: number;
  status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON';
  statusLabel: string;
  organizerName: string;
  organizerId?: string;
  staffIds?: string[];
  registeredUserIds?: string[];
  bannerImageUrl?: string | null;
}

export interface EventScheduleItemDto {
  id: string;
  time: string;
  title: string;
  description: string;
  /** BOOTH and GATE are legacy values kept so older saved programs still load. */
  type:
    | 'KEYNOTE'
    | 'SESSION'
    | 'WORKSHOP'
    | 'PANEL'
    | 'BREAK'
    | 'OTHER'
    | 'BOOTH'
    | 'GATE';
  location?: string;
  /** Optional station (checkpoint) where attendance for this item is scanned. */
  checkpointId?: string;
}

export interface EventSpeakerDto {
  id: string;
  name: string;
  role: string;
  company: string;
  avatarUrl?: string;
  topic?: string;
}

export interface EventDetailResponseDto extends EventResponseDto {
  durationDays: number;
  durationLabel: string;
  checkpointMode: string;
  scheduleDateLabel: string;
  startDateIso: string;
  endDateIso: string;
  checkpoints: {
    id: string;
    name: string;
    location: string | null;
    type: string;
    allowMultipleScans: boolean;
    requireMainEntry: boolean;
  }[];
  schedule: EventScheduleItemDto[];
  speakers: EventSpeakerDto[];
  bannerImageUrl: string;
}

export type OrganizerEventStatus = 'Upcoming' | 'In progress' | 'Completed';
export type RegistrantStatus = 'Registered' | 'Checked In' | 'Cancelled';
export type ApprovalStatusLabel = 'Pending' | 'Approved' | 'Rejected';

export interface OrganizerEventDto {
  id: string;
  organizer_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  registrations_count: number;
  capacity: number | null;
  status: OrganizerEventStatus;
  description: string;
  allow_walk_ins: boolean;
  approval_status: ApprovalStatusLabel;
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  is_private?: boolean;
  category?: string;
  category_label?: string;
  tags?: string[];
  checkpoints_count?: number;
  admitted_count?: number;
  organizers?: EventOrganizerDto[];
  banner_image_url?: string | null;
  schedule?: EventScheduleItemDto[];
  speakers?: CreateEventSpeakerDto[];
}

export interface EventLiveKpisDto {
  totalRsvps: number;
  checkedInAttendees: number;
  attendanceRate: number;
  venueOccupancy: number;
  maxCapacity: number | null;
  activeStationsCount: number;
  totalVerifiedScans: number;
}

export interface HourlyFlowPointDto {
  hour: string;
  scans: number;
}

export interface StationTrafficDto {
  id: string;
  name: string;
  type: string;
  scans: number;
  percentage: number;
}

export interface RecentScanItemDto {
  id: string;
  attendeeName: string;
  affiliation: string;
  ticketCode: string;
  stationId: string;
  stationName: string;
  scannedAt: string;
  status: string;
  statusLabel: string;
}

export interface EventLiveOverviewDto {
  id: string;
  organizerId: string;
  name: string;
  slug: string;
  category: string;
  categoryLabel: string;
  capacity: number | null;
  venue: string;
  startsAt: string;
  endsAt: string;
  kpis: EventLiveKpisDto;
  hourlyFlow: HourlyFlowPointDto[];
  stationTraffic: StationTrafficDto[];
  recentScans: RecentScanItemDto[];
  organizers?: EventOrganizerDto[];
}

export interface EventCheckpointDto {
  id: string;
  name: string;
  location: string | null;
  type: string;
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  cooldownSeconds: number;
  eventId: string;
  eventName: string;
  parentId: string | null;
}

export interface ScanResultDto {
  scanResult: 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';
  ticketCode: string;
  attendeeName?: string;
  affiliation?: string;
  stationName?: string;
  scannedAt: string;
  firstScannedAt?: string | null;
  message: string;
  cooldownActive?: boolean;
  cooldownSeconds?: number;
  cooldownRemainingSeconds?: number;
  /** Attendee's booth stamp progress, present on SUCCESS/DUPLICATE scans. */
  progress?: ProgressSummaryDto;
  verificationMethod?: 'QR' | 'FACE_ID';
  faceConfidence?: number;
}

export interface AdminEventDto extends OrganizerEventDto {
  organizer_name: string;
  organizer_email: string;
}

export interface EventRegistrantDto {
  id: string;
  event_id: string;
  attendee_id: string | null;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: RegistrantStatus;
}

export interface EventOrganizerDto {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  affiliation: string | null;
  assignedAt: string;
  isPrimary: boolean;
}

export interface OrganizerCandidateDto {
  id: string;
  email: string;
  fullName: string;
  affiliation: string | null;
}

export class UpdateEventDto {
  name?: string;
  description?: string;
  venue?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
  allow_walk_ins?: boolean;
  is_private?: boolean;
  category?: string;
  tags?: string[];
  banner_image_url?: string;
  schedule?: EventScheduleItemDto[];
  speakers?: CreateEventSpeakerDto[];
  organizerEmails?: string[];
}

export type StaffAccessLevel = 'ALL_SCANNERS' | 'SPECIFIC_BOOTH';

export interface EventStaffDto {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  affiliation: string | null;
  assignedAt: string;
  accessLevel?: StaffAccessLevel;
  checkpointId?: string | null;
  checkpointName?: string | null;
}

export interface CreateEventSpeakerDto {
  id?: string;
  name: string;
  role?: string;
  company?: string;
  avatarUrl?: string;
  topic?: string;
}

export interface CreateEventEntranceDto {
  name: string;
  location?: string;
  allowMultipleScans?: boolean;
}

export interface CreateEventBoothDto {
  name: string;
  location?: string;
  allowMultipleScans?: boolean;
  requireMainEntry?: boolean;
}

export interface CreateEventStaffAssignmentDto {
  email: string;
  accessLevel: StaffAccessLevel;
  checkpointName?: string;
}

export class CreateEventDto {
  name!: string;
  description?: string;
  venue!: string;
  starts_at!: string;
  ends_at!: string;
  capacity!: number;
  allow_walk_ins?: boolean;
  is_private?: boolean;
  category?: string;
  tags?: string[];
  banner_image_url?: string;
  schedule?: EventScheduleItemDto[];
  speakers?: CreateEventSpeakerDto[];
  organizerEmails?: string[];
  entrances?: CreateEventEntranceDto[];
  booths?: CreateEventBoothDto[];
  staffAssignments?: CreateEventStaffAssignmentDto[];
}

export class ReviewEventDto {
  decision!: 'APPROVED' | 'REJECTED';
  notes?: string;
}

const REGISTRANT_STATUS_LABELS: Record<TicketStatus, RegistrantStatus> = {
  REGISTERED: 'Registered',
  CHECKED_IN: 'Checked In',
  CANCELLED: 'Cancelled',
};

const APPROVAL_STATUS_LABELS: Record<EventApprovalStatus, ApprovalStatusLabel> =
  {
    PENDING: 'Pending',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
  };

// Tickets that hold a seat (everything except cancelled).
const ACTIVE_TICKET_FILTER = { status: { not: TicketStatus.CANCELLED } };

const ADMIN_EVENT_INCLUDE = {
  organizer: { select: { id: true, fullName: true, email: true } },
  _count: { select: { tickets: { where: ACTIVE_TICKET_FILTER } } },
} satisfies Prisma.EventInclude;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationMailer: GuestInvitationMailer,
  ) {}

  async previewGuestFile(
    user: UserSummaryDto,
    eventId: string,
    file: GuestImportFile | undefined,
  ): Promise<GuestFilePreviewDto> {
    await this.findManageableEvent(user, eventId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A CSV or XLSX file is required');
    }
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx') {
      throw new BadRequestException('Only .csv and .xlsx files are supported');
    }

    let worksheet: ExcelJS.Worksheet;
    try {
      const workbook = new ExcelJS.Workbook();
      const fileStream = Readable.from([file.buffer]);
      if (extension === 'csv') {
        worksheet = await workbook.csv.read(fileStream);
      } else {
        await workbook.xlsx.read(fileStream);
        const first = workbook.worksheets[0];
        if (!first) throw new BadRequestException('No worksheets found');
        worksheet = first;
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException('Unable to parse file');
    }

    const detectedHeaders: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell({ includeEmpty: false }, (cell) => {
      const text = cell.text.trim();
      if (text) detectedHeaders.push(text);
    });

    const sampleRows: string[][] = [];
    const maxSample = Math.min(worksheet.rowCount, 4);
    for (let r = 2; r <= maxSample; r++) {
      const row = worksheet.getRow(r);
      const cells: string[] = [];
      const colCount = Math.max(detectedHeaders.length, row.cellCount);
      for (let c = 1; c <= colCount; c++) {
        cells.push(row.getCell(c).text.trim());
      }
      sampleRows.push(cells);
    }

    return {
      fileName: file.originalname,
      totalRows: Math.max(0, worksheet.rowCount - 1),
      detectedHeaders,
      sampleRows,
    };
  }

  async importGuestUsers(
    user: UserSummaryDto,
    eventId: string,
    file: GuestImportFile | undefined,
    includeCredentials?: string | boolean,
    mapping?: GuestImportMappingDto,
  ): Promise<GuestImportResult> {
    const event = await this.findManageableEvent(user, eventId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('A CSV or XLSX file is required');
    }

    const returnCredentials = this.parseCredentialFlag(includeCredentials);
    if (
      returnCredentials &&
      (!['development', 'test'].includes(process.env.NODE_ENV ?? '') ||
        process.env.GUEST_IMPORT_DEBUG_CREDENTIALS !== 'true')
    ) {
      throw new ForbiddenException(
        'Temporary credential visibility is disabled on this server',
      );
    }

    const parsedFile = await this.parseGuestFile(file, mapping);
    const result: GuestImportResult = {
      created: [],
      skipped: parsedFile.skipped,
      emailFailures: [],
      summary: { created: 0, skipped: 0, emailFailures: 0 },
      ...(returnCredentials ? { credentials: [] } : {}),
    };

    const uniqueGuests = new Map<string, ParsedGuest>();
    for (const guest of parsedFile.guests) {
      if (uniqueGuests.has(guest.email)) {
        result.skipped.push({
          row: guest.row,
          email: guest.email,
          reason: 'duplicate_in_file',
        });
      } else {
        uniqueGuests.set(guest.email, guest);
      }
    }

    const candidates = [...uniqueGuests.values()];
    const existingUsers = candidates.length
      ? await this.prisma.user.findMany({
          where: {
            email: {
              in: candidates.map((guest) => guest.email),
              mode: 'insensitive',
            },
          },
          select: { email: true },
        })
      : [];
    const existingEmails = new Set(
      existingUsers.map((existing) => existing.email.toLowerCase()),
    );
    const existingTickets = candidates.length
      ? await this.prisma.ticket.findMany({
          where: {
            eventId,
            email: {
              in: candidates.map((guest) => guest.email),
              mode: 'insensitive',
            },
          },
          select: { email: true },
        })
      : [];
    const registeredEmails = new Set(
      existingTickets.map((ticket) => ticket.email.toLowerCase()),
    );
    let activeRegistrations = await this.prisma.ticket.count({
      where: { eventId, status: { not: TicketStatus.CANCELLED } },
    });
    if (
      (event.capacity === null || activeRegistrations < event.capacity) &&
      candidates.some(
        (guest) =>
          !existingEmails.has(guest.email) &&
          !registeredEmails.has(guest.email),
      )
    ) {
      await this.invitationMailer.assertConfigured();
    }
    const usedPasswords = new Set<string>();

    for (const guest of candidates) {
      if (existingEmails.has(guest.email)) {
        result.skipped.push({
          row: guest.row,
          email: guest.email,
          reason: 'email_already_registered',
        });
        continue;
      }
      if (registeredEmails.has(guest.email)) {
        result.skipped.push({
          row: guest.row,
          email: guest.email,
          reason: 'email_already_registered_for_event',
        });
        continue;
      }
      if (event.capacity !== null && activeRegistrations >= event.capacity) {
        result.skipped.push({
          row: guest.row,
          email: guest.email,
          reason: 'event_capacity_reached',
        });
        continue;
      }

      const temporaryPassword =
        this.generateUniqueTemporaryPassword(usedPasswords);
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const ticketCode = generateTicketCode();
      let account: {
        id: string;
        email: string;
        fullName: string;
        tickets: Array<{ id: string; ticketCode: string }>;
      };
      try {
        account = await this.prisma.user.create({
          data: {
            email: guest.email,
            passwordHash,
            fullName:
              guest.fullName || `${guest.firstName} ${guest.lastName}`.trim(),
            role: UserRole.ATTENDEE,
            studentId: guest.studentId || null,
            contactNumber: guest.contactNumber || null,
            affiliation: guest.affiliation || DEFAULT_GUEST_AFFILIATION,
            isActive: true,
            deletedAt: null,
            mustChangePassword: true,
            tickets: {
              create: {
                event: { connect: { id: eventId } },
                firstName: guest.firstName,
                lastName: guest.lastName,
                email: guest.email,
                studentId: guest.studentId || null,
                contactNumber: guest.contactNumber || null,
                affiliation: guest.affiliation || DEFAULT_GUEST_AFFILIATION,
                ticketType: TicketType.REGULAR,
                ticketCode,
                qrPayload: ticketCode,
                status: TicketStatus.REGISTERED,
              },
            },
          },
          select: {
            id: true,
            email: true,
            fullName: true,
            tickets: { select: { id: true, ticketCode: true } },
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          result.skipped.push({
            row: guest.row,
            email: guest.email,
            reason: 'email_or_registration_already_exists',
          });
          continue;
        }
        throw error;
      }
      const ticket = account.tickets[0];
      if (!ticket) {
        throw new Error(
          `Guest account '${account.id}' was created without its event registration`,
        );
      }
      activeRegistrations += 1;

      let emailStatus: 'SENT' | 'FAILED' = 'SENT';
      try {
        await this.invitationMailer.sendInvitation({
          eventTitle: event.title,
          email: account.email,
          fullName: account.fullName,
          temporaryPassword,
          ticketCode: ticket.ticketCode,
        });
      } catch (error) {
        emailStatus = 'FAILED';
        result.emailFailures.push(account.email);
        this.logger.warn(
          `Guest invitation email failed for ${account.email}: ${
            error instanceof Error ? error.message : 'Unknown mail error'
          }`,
        );
      }

      result.created.push({
        id: account.id,
        email: account.email,
        fullName: account.fullName,
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        emailStatus,
      });
      if (result.credentials) {
        result.credentials.push({
          email: account.email,
          temporaryPassword,
        });
      }
    }

    result.summary = {
      created: result.created.length,
      skipped: result.skipped.length,
      emailFailures: result.emailFailures.length,
    };
    return result;
  }

  private parseCredentialFlag(value?: string | boolean): boolean {
    if (value === undefined || value === false || value === 'false') {
      return false;
    }
    if (value === true || value === 'true') {
      return true;
    }
    throw new BadRequestException(
      'includeCredentials must be either true or false',
    );
  }

  private generateUniqueTemporaryPassword(used: Set<string>): string {
    let password = '';
    do {
      password = Array.from({ length: 10 }, () =>
        TEMP_PASSWORD_ALPHABET.charAt(randomInt(TEMP_PASSWORD_ALPHABET.length)),
      ).join('');
    } while (used.has(password));
    used.add(password);
    return password;
  }

  private async parseGuestFile(
    file: GuestImportFile,
    mapping?: GuestImportMappingDto,
  ): Promise<{
    guests: ParsedGuest[];
    skipped: GuestImportResult['skipped'];
  }> {
    const extension = file.originalname.split('.').pop()?.toLowerCase();
    if (extension !== 'csv' && extension !== 'xlsx') {
      throw new BadRequestException('Only .csv and .xlsx files are supported');
    }

    let worksheet: ExcelJS.Worksheet;
    try {
      const workbook = new ExcelJS.Workbook();
      const fileStream = Readable.from([file.buffer]);
      if (extension === 'csv') {
        worksheet = await workbook.csv.read(fileStream);
      } else {
        await workbook.xlsx.read(fileStream);
        const firstWorksheet = workbook.worksheets[0];
        if (!firstWorksheet) {
          throw new BadRequestException('The workbook contains no worksheets');
        }
        worksheet = firstWorksheet;
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`Guest import file parsing failed: ${String(error)}`);
      throw new BadRequestException('The uploaded file could not be parsed');
    }

    if (worksheet.rowCount > MAX_GUEST_ROWS + 1) {
      throw new BadRequestException(
        `A guest import may contain at most ${MAX_GUEST_ROWS} data rows`,
      );
    }

    const hasHeaders = mapping?.hasHeaders !== false;
    const headerIndexes = new Map<string, number>();

    if (hasHeaders) {
      worksheet.getRow(1).eachCell((cell, column) => {
        const header = cell.text.trim().toLowerCase().replace(/\s+/g, ' ');
        if (header) headerIndexes.set(header, column);
      });
    }

    const resolveCol = (colSpec?: string | number): number | undefined => {
      if (typeof colSpec === 'number' && colSpec > 0) return colSpec;
      if (!colSpec) return undefined;
      const trimmed = String(colSpec).trim();
      const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
      if (headerIndexes.has(lower)) {
        return headerIndexes.get(lower);
      }
      const parsed = parseInt(trimmed, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
      return undefined;
    };

    const isExplicitMapping = !!(
      mapping &&
      (mapping.emailColumn !== undefined ||
        mapping.fullNameColumn !== undefined ||
        mapping.firstNameColumn !== undefined ||
        mapping.lastNameColumn !== undefined)
    );

    let colFullName: number | undefined;
    let colFirstName: number | undefined;
    let colLastName: number | undefined;
    let colEmail: number | undefined;
    let colStudentId: number | undefined;
    let colContactNumber: number | undefined;
    let colAffiliation: number | undefined;

    const nameMode =
      mapping?.nameMode ??
      (mapping?.fullNameColumn !== undefined ? 'single' : 'split');

    if (isExplicitMapping) {
      colFullName = resolveCol(mapping?.fullNameColumn);
      colFirstName = resolveCol(mapping?.firstNameColumn);
      colLastName = resolveCol(mapping?.lastNameColumn);
      colEmail = resolveCol(mapping?.emailColumn);
      colStudentId = resolveCol(mapping?.studentIdColumn);
      colContactNumber = resolveCol(mapping?.contactNumberColumn);
      colAffiliation = resolveCol(mapping?.affiliationColumn);

      if (!colEmail) {
        throw new BadRequestException(
          'The specified email column could not be found in the file',
        );
      }
      if (nameMode === 'single' && !colFullName) {
        throw new BadRequestException(
          'The specified full name column could not be found in the file',
        );
      }
      if (nameMode === 'split' && (!colFirstName || !colLastName)) {
        throw new BadRequestException(
          'Both first name and last name columns must be specified',
        );
      }
    } else {
      for (const requiredHeader of ['first name', 'last name', 'email']) {
        if (!headerIndexes.has(requiredHeader)) {
          throw new BadRequestException(
            `The file is missing the '${requiredHeader}' column`,
          );
        }
      }
      colFirstName = headerIndexes.get('first name');
      colLastName = headerIndexes.get('last name');
      colEmail = headerIndexes.get('email');
      colAffiliation = headerIndexes.get('affiliation');
    }

    const startRow = hasHeaders ? 2 : 1;
    const guests: ParsedGuest[] = [];
    const skipped: GuestImportResult['skipped'] = [];

    for (let rowNumber = startRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const read = (colIndex?: number) =>
        colIndex ? row.getCell(colIndex).text.trim() : '';

      let firstName = '';
      let lastName = '';
      let fullName = '';

      if (nameMode === 'single' && colFullName) {
        fullName = read(colFullName);
        firstName = fullName;
        lastName = fullName;
      } else {
        firstName = read(colFirstName);
        lastName = read(colLastName);
        fullName = `${firstName} ${lastName}`.trim();
      }

      const email = read(colEmail).toLowerCase();
      const studentId = read(colStudentId) || null;
      const contactNumber = read(colContactNumber) || null;
      const affiliation = read(colAffiliation);

      if (
        !firstName &&
        !lastName &&
        !fullName &&
        !email &&
        !affiliation &&
        !studentId &&
        !contactNumber
      ) {
        continue;
      }

      const reasons: string[] = [];
      if (nameMode === 'single') {
        if (!fullName) reasons.push('name_required');
      } else {
        if (!firstName) reasons.push('first_name_required');
        if (!lastName) reasons.push('last_name_required');
      }

      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        reasons.push('invalid_email');
      }
      if (
        firstName.length > 100 ||
        lastName.length > 100 ||
        fullName.length > 200
      ) {
        reasons.push('name_too_long');
      }
      if (affiliation && affiliation.length > 200) {
        reasons.push('affiliation_too_long');
      }
      if (studentId && studentId.length > 50) {
        reasons.push('student_id_too_long');
      }
      if (contactNumber && contactNumber.length > 30) {
        reasons.push('contact_number_too_long');
      }

      if (reasons.length) {
        skipped.push({
          row: rowNumber,
          ...(email ? { email } : {}),
          reason: reasons.join(','),
        });
      } else {
        guests.push({
          row: rowNumber,
          fullName,
          firstName,
          lastName,
          email,
          studentId,
          contactNumber,
          affiliation,
        });
      }
    }
    return { guests, skipped };
  }

  /** Public listing: only active, admin-approved events. */
  async findAll(): Promise<EventResponseDto[]> {
    const events = await this.prisma.event.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        approvalStatus: EventApprovalStatus.APPROVED,
        isPrivate: false,
      },
      include: {
        organizer: {
          select: { id: true, fullName: true, affiliation: true },
        },
        staff: {
          where: { isActive: true },
          select: { userId: true },
        },
        tickets: {
          where: ACTIVE_TICKET_FILTER,
          select: { id: true, userId: true },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((ev) => {
      const spotsTaken = ev.tickets.length;
      const spotsTotal = ev.capacity ?? 100;
      const spotsRemaining = spotsTotal - spotsTaken;

      let status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON' = 'OPEN';
      let statusLabel = 'Registration Open';

      const now = new Date();
      const start = new Date(ev.startDate);
      const end = new Date(ev.endDate);

      if (now >= start && now <= end) {
        status = 'LIVE_TODAY';
        statusLabel = 'Happening Today';
      } else if (spotsRemaining <= 15 && spotsRemaining > 0) {
        status = 'CLOSING_SOON';
        statusLabel = `${spotsRemaining} Spots Left`;
      }

      // Infer or use explicitly saved category
      const lowerSlug = (ev.slug + ' ' + ev.title).toLowerCase();
      let category = ev.category ? normalizeCategoryName(ev.category) : '';
      if (!category) {
        if (lowerSlug.includes('hackathon') || lowerSlug.includes('sprint')) {
          category = 'Hackathon';
        } else if (lowerSlug.includes('workshop') || lowerSlug.includes('masterclass')) {
          category = 'Workshop';
        } else if (lowerSlug.includes('expo') || lowerSlug.includes('showcase')) {
          category = 'Expo / Showcase';
        } else {
          category = 'Conference';
        }
      }
      const categoryLabel = category;

      const dateLabel = start.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const timeLabel = `${start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })} - ${end.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}`;

      return {
        id: ev.id,
        slug: ev.slug,
        title: ev.title,
        description: ev.description ?? '',
        category,
        categoryLabel,
        dateLabel,
        timeLabel,
        venue: ev.venueName,
        spotsTotal,
        spotsTaken,
        status,
        statusLabel,
        organizerName: ev.organizer?.fullName ?? 'Campus Organizer',
        organizerId: ev.organizerId,
        staffIds: ev.staff.map((s) => s.userId),
        registeredUserIds: ev.tickets
          .map((t) => t.userId)
          .filter((uid): uid is string => uid !== null),
        tags: ev.tags ?? [],
        bannerImageUrl: ev.bannerImageUrl ?? null,
      };
    });
  }

  async findOne(idOrSlug: string): Promise<EventDetailResponseDto> {
    const ev = await this.prisma.event.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
        isActive: true,
        deletedAt: null,
        approvalStatus: EventApprovalStatus.APPROVED,
      },
      include: {
        organizer: {
          select: { id: true, fullName: true, affiliation: true },
        },
        staff: {
          where: { isActive: true },
          select: { userId: true },
        },
        tickets: {
          where: ACTIVE_TICKET_FILTER,
          select: { id: true, userId: true },
        },
        checkpoints: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            location: true,
            type: true,
            allowMultipleScans: true,
            requireMainEntry: true,
          },
        },
      },
    });

    if (!ev) {
      throw new NotFoundException(`Event '${idOrSlug}' not found`);
    }

    const spotsTaken = ev.tickets.length;
    const spotsTotal =
      ev.slug === 'devcon-manila-2026' ? 500 : (ev.capacity ?? 100);
    const spotsRemaining = Math.max(0, spotsTotal - spotsTaken);

    let status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON' = 'OPEN';
    let statusLabel = 'Registration Open';

    const now = new Date();
    const start = new Date(ev.startDate);
    const end = new Date(ev.endDate);

    if (now >= start && now <= end) {
      status = 'LIVE_TODAY';
      statusLabel = 'Happening Today';
    } else if (spotsRemaining <= 15 && spotsRemaining > 0) {
      status = 'CLOSING_SOON';
      statusLabel = `${spotsRemaining} Spots Left`;
    }

    const lowerSlug = (ev.slug + ' ' + ev.title).toLowerCase();
    let category = ev.category ? normalizeCategoryName(ev.category) : '';
    if (!category) {
      if (lowerSlug.includes('hackathon') || lowerSlug.includes('sprint')) {
        category = 'Hackathon';
      } else if (lowerSlug.includes('workshop') || lowerSlug.includes('masterclass')) {
        category = 'Workshop';
      } else if (lowerSlug.includes('expo') || lowerSlug.includes('showcase')) {
        category = 'Expo / Showcase';
      } else {
        category = 'Conference';
      }
    }
    const categoryLabel = category;

    const dateLabel = start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const scheduleDateLabel = start.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });

    const timeLabel = `${start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })} - ${end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;

    const diffDays = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const durationDays = ev.slug === 'devcon-manila-2026' ? 3 : diffDays;
    const durationLabel = `${durationDays} ${durationDays === 1 ? 'Day' : 'Days'}`;

    const checkpointMode =
      ev.checkpoints.length > 1 ? 'Multi-stop Checks' : 'Single Gate Entry';

    const schedule =
      ev.schedule && Array.isArray(ev.schedule) && (ev.schedule as any[]).length > 0
        ? (ev.schedule as unknown as EventScheduleItemDto[])
        : this.buildScheduleTimeline(ev);
    const speakers = this.buildFeaturedSpeakers(ev);
    const bannerImageUrl =
      ev.bannerImageUrl || this.resolveBannerImage(ev.slug, category);

    return {
      id: ev.id,
      slug: ev.slug,
      title: ev.title,
      description: ev.description ?? '',
      category,
      categoryLabel,
      dateLabel,
      timeLabel,
      venue: ev.venueName,
      spotsTotal,
      spotsTaken,
      status,
      statusLabel,
      organizerName: ev.organizer?.fullName ?? 'Campus Organizer',
      organizerId: ev.organizerId,
      staffIds: ev.staff.map((s) => s.userId),
      registeredUserIds: ev.tickets
        .map((t) => t.userId)
        .filter((uid): uid is string => uid !== null),
      tags: ev.tags ?? [],
      durationDays,
      durationLabel,
      checkpointMode,
      scheduleDateLabel,
      startDateIso: ev.startDate.toISOString(),
      endDateIso: ev.endDate.toISOString(),
      checkpoints: ev.checkpoints.map((c) => ({
        id: c.id,
        name: c.name,
        location: c.location,
        type: c.type,
        allowMultipleScans: c.allowMultipleScans,
        requireMainEntry: c.requireMainEntry,
      })),
      schedule,
      speakers,
      bannerImageUrl,
    };
  }

  private buildScheduleTimeline(ev: {
    slug: string;
    checkpoints: Array<{ id: string; name: string; location: string | null; type: string }>;
  }): EventScheduleItemDto[] {
    if (ev.slug === 'devcon-manila-2026') {
      return [
        {
          id: 'sch-devcon-1',
          time: '09:00 AM',
          title: 'Opening Plenary',
          description: 'Keynote on tech communities in the Philippines',
          type: 'KEYNOTE',
          location: 'Function Room 1-3',
          checkpointId: 'chk-devcon-plenary',
        },
        {
          id: 'sch-devcon-2',
          time: '10:30 AM',
          title: 'AI/ML Breakout',
          description: 'Deploying production grade LLMs',
          type: 'SESSION',
          location: 'Function Room 4',
          checkpointId: 'chk-devcon-workshop',
        },
        {
          id: 'sch-devcon-3',
          time: '01:00 PM',
          title: 'UX & Frontend Design Studio',
          description: 'Interactive hand-on wireframing workshop',
          type: 'WORKSHOP',
          location: 'Function Room 4',
          checkpointId: 'chk-devcon-workshop',
        },
        {
          id: 'sch-devcon-4',
          time: '03:30 PM',
          title: 'Panel Discussion',
          description: 'Careers in software architecture and cloud engineering',
          type: 'PANEL',
          location: 'Function Room 1-3',
        },
      ];
    }

    if (ev.slug === 'global-tech-ai-expo-2026') {
      return [
        {
          id: 'sch-expo-1',
          time: '09:00 AM',
          title: 'Exhibition Opening & Registration',
          description: 'Keynote remarks and partner showcase floor opening',
          type: 'KEYNOTE',
          location: 'Grand Exhibition Hall',
        },
        {
          id: 'sch-expo-2',
          time: '11:00 AM',
          title: 'Robotics & Autonomous Hardware Keynote',
          description: 'Live stage demonstrations in next-gen robotics',
          type: 'SESSION',
          location: 'Hall A Stage',
        },
        {
          id: 'sch-expo-3',
          time: '02:00 PM',
          title: 'Enterprise AI Architecture Showcase',
          description: 'Hands-on walkthroughs with cloud enterprise solutions',
          type: 'WORKSHOP',
          location: 'Partner Pavilion',
        },
        {
          id: 'sch-expo-4',
          time: '04:30 PM',
          title: 'Global Innovation Awards & Mixer',
          description: 'Networking reception with exhibitors and sponsors',
          type: 'PANEL',
          location: 'Atrium Lounge',
        },
      ];
    }

    if (ev.slug === 'tech-summit-2026') {
      return [
        {
          id: 'sch-summit-1',
          time: '08:00 AM',
          title: 'Turnstile Check-in & Breakfast',
          description: 'Main gate verification and welcome kit collection',
          type: 'GATE',
          location: 'East Entrance Gates',
          checkpointId: 'chk-main-gate',
        },
        {
          id: 'sch-summit-2',
          time: '09:30 AM',
          title: 'Plenary Keynote: Future of Computing',
          description: 'Opening remarks on student technology innovation',
          type: 'KEYNOTE',
          location: '2nd Floor Main Plenary',
          checkpointId: 'chk-session-keynote',
        },
        {
          id: 'sch-summit-3',
          time: '01:00 PM',
          title: 'Capstone Showcase & Sponsor Alley',
          description: 'Interactive demo floor and booth exploration',
          type: 'BOOTH',
          location: 'Ground Floor Atrium',
          checkpointId: 'chk-booth-showcase',
        },
        {
          id: 'sch-summit-4',
          time: '03:30 PM',
          title: 'Student Hack Showcase & Awards',
          description: 'Presentations and recognition of top projects',
          type: 'PANEL',
          location: 'Main Stage',
        },
      ];
    }

    if (ev.slug === 'national-ai-hackathon-2026') {
      return [
        {
          id: 'sch-hack-1',
          time: '09:00 AM',
          title: 'Hacker Check-in & Team Formation',
          description: 'Badge issuance, hardware distribution, and mentoring signups',
          type: 'GATE',
          location: 'Main Arena',
        },
        {
          id: 'sch-hack-2',
          time: '11:00 AM',
          title: 'Challenge Briefing & Hacking Begins',
          description: 'Official problem statements and API credits release',
          type: 'KEYNOTE',
          location: 'Auditorium',
        },
        {
          id: 'sch-hack-3',
          time: '08:00 PM',
          title: 'Midnight Pitch Clinic',
          description: 'Optional practice pitches with venture mentors',
          type: 'WORKSHOP',
          location: 'Mentors Corner',
        },
        {
          id: 'sch-hack-4',
          time: '02:00 PM',
          title: 'Project Submission & Final Demos',
          description: 'Final judging floor and winner announcement',
          type: 'PANEL',
          location: 'Main Arena Stage',
        },
      ];
    }

    // Events without a saved program show none. The program is separate from
    // stations: it is never derived from checkpoints.
    return [];
  }

  private buildFeaturedSpeakers(ev: {
    slug: string;
    speakers?: any;
    organizer?: { fullName: string; affiliation: string | null };
  }): EventSpeakerDto[] {
    if (ev.speakers && Array.isArray(ev.speakers) && ev.speakers.length > 0) {
      return (ev.speakers as any[]).map((s, idx) => ({
        id: s.id || `spk-${idx + 1}`,
        name: s.name,
        role: s.role || 'Keynote Speaker',
        company: s.company || '',
        avatarUrl: s.avatarUrl,
        topic: s.topic,
      }));
    }

    if (ev.slug === 'devcon-manila-2026') {
      return [
        {
          id: 'spk-1',
          name: 'John Doe',
          role: 'Head of Product',
          company: 'DevCon PH',
          avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          topic: 'Building Open Source Communities in Southeast Asia',
        },
        {
          id: 'spk-2',
          name: 'Jane Smith',
          role: 'UX Research Lead',
          company: 'Studio Craft',
          avatarUrl: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80',
          topic: 'Human-Centered System Architecture',
        },
        {
          id: 'spk-3',
          name: 'Alex Mercer',
          role: 'AI Infrastructure Specialist',
          company: 'DataForge',
          avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          topic: 'Autonomous Agents and Cloud Infrastructure',
        },
      ];
    }

    if (ev.slug === 'global-tech-ai-expo-2026') {
      return [
        {
          id: 'spk-expo-1',
          name: 'Sophia Vargas',
          role: 'VP of AI Research',
          company: 'Global AI Enterprise',
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
          topic: 'Enterprise LLMs in Mission-Critical Systems',
        },
        {
          id: 'spk-expo-2',
          name: 'David Kim',
          role: 'Lead Systems Architect',
          company: 'NextGen Robotics',
          avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
          topic: 'Embodied AI & High-Speed Vision Hardware',
        },
        {
          id: 'spk-expo-3',
          name: 'Elena Rostova',
          role: 'Cloud Solutions Director',
          company: 'HyperScale Labs',
          avatarUrl: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=150&auto=format&fit=crop&q=80',
          topic: 'Global Distributed Databases at Scale',
        },
      ];
    }

    if (ev.slug === 'tech-summit-2026') {
      return [
        {
          id: 'spk-summit-1',
          name: 'Dr. Ramon Castillo',
          role: 'Dean of Computer Studies',
          company: 'DLSU-D',
          avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&auto=format&fit=crop&q=80',
          topic: 'Higher Education in the Age of Generative AI',
        },
        {
          id: 'spk-summit-2',
          name: 'Maria Santos',
          role: 'Engineering Director',
          company: 'TechVentures PH',
          avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
          topic: 'From Campus Projects to Tech Startups',
        },
        {
          id: 'spk-summit-3',
          name: 'Paolo Reyes',
          role: 'Senior Mobile Developer',
          company: 'AppFoundry',
          avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
          topic: 'Cross-Platform Framework Performance',
        },
      ];
    }

    if (ev.slug === 'national-ai-hackathon-2026') {
      return [
        {
          id: 'spk-hack-1',
          name: 'Marcus Chen',
          role: 'Founder',
          company: 'Agentic Systems Lab',
          avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
          topic: 'Architecting Multi-Agent Coding Swarms',
        },
        {
          id: 'spk-hack-2',
          name: 'Chloe Bennett',
          role: 'Principal Architect',
          company: 'DeepGraph AI',
          avatarUrl: 'https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80',
          topic: 'Graph RAG and Knowledge Distillation',
        },
        {
          id: 'spk-hack-3',
          name: 'Karlo Dela Cruz',
          role: 'Head of Developer Relations',
          company: 'CloudPioneer',
          avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80',
          topic: 'Building Resilient Event-Driven Applications',
        },
      ];
    }

    return [];
  }

  private resolveBannerImage(
    slug: string,
    category: string,
  ): string {
    const catLower = (category || '').toLowerCase();
    if (slug === 'devcon-manila-2026') {
      return 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&auto=format&fit=crop&q=80';
    }
    if (slug === 'global-tech-ai-expo-2026' || catLower.includes('expo') || catLower.includes('showcase')) {
      return 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=80';
    }
    if (slug === 'national-ai-hackathon-2026' || catLower.includes('hackathon')) {
      return 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&auto=format&fit=crop&q=80';
    }
    if (catLower.includes('workshop')) {
      return 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80';
    }
    if (catLower.includes('tournament') || catLower.includes('sport') || catLower.includes('esport')) {
      return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80';
    }
    if (catLower.includes('concert') || catLower.includes('cultural') || catLower.includes('music')) {
      return 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80';
    }
    return 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200&auto=format&fit=crop&q=80';
  }

  /** Events the user organizes (admins see every active event; staff see assigned events). */
  async findForOrganizer(user: UserSummaryDto): Promise<OrganizerEventDto[]> {
    this.assertOrganizerRole(user);

    const events = await this.prisma.event.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(user.role === 'ADMIN'
          ? {}
          : {
              OR: [
                { organizerId: user.id },
                { organizers: { some: { userId: user.id } } },
                { staff: { some: { userId: user.id, isActive: true } } },
                {
                  checkpoints: {
                    some: {
                      isActive: true,
                      deletedAt: null,
                      assignedStaff: { some: { userId: user.id, isActive: true } },
                    },
                  },
                },
              ],
            }),
      },
      include: {
        _count: {
          select: {
            tickets: { where: ACTIVE_TICKET_FILTER },
            checkpoints: { where: { isActive: true, deletedAt: null } },
          },
        },
        tickets: {
          where: { status: TicketStatus.CHECKED_IN },
          select: { id: true },
        },
        organizer: { select: { id: true, email: true, fullName: true, affiliation: true } },
        organizers: {
          include: {
            user: { select: { id: true, email: true, fullName: true, affiliation: true } },
          },
        },
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((ev) => {
      const base = this.toOrganizerEvent(ev, ev._count.tickets);
      const lowerTitle = ev.title.toLowerCase();
      let category = ev.category ? normalizeCategoryName(ev.category) : '';
      if (!category) {
        if (lowerTitle.includes('hackathon')) {
          category = 'Hackathon';
        } else if (lowerTitle.includes('workshop')) {
          category = 'Workshop';
        } else if (lowerTitle.includes('expo') || lowerTitle.includes('demo')) {
          category = 'Expo / Showcase';
        } else {
          category = 'Conference';
        }
      }
      const category_label = category;

      return {
        ...base,
        category,
        category_label,
        tags: ev.tags ?? [],
        checkpoints_count: ev._count.checkpoints ?? 0,
        admitted_count: ev.tickets ? ev.tickets.length : 0,
      };
    });
  }

  /** Organizer submits a new event; it stays hidden until an admin approves it. */
  async create(
    user: UserSummaryDto,
    dto: CreateEventDto,
  ): Promise<OrganizerEventDto> {
    this.assertOrganizerRole(user);

    const title = this.requireText(dto.name, 'Event title is required');
    const venueName = this.requireText(dto.venue, 'Venue is required');
    const [startDate, endDate] = this.parseDateRange(
      dto.starts_at,
      dto.ends_at,
    );
    if (startDate <= new Date()) {
      throw new BadRequestException('Start date & time must be in the future');
    }
    const capacity = this.parseCapacity(dto.capacity);
    const isPrivate = dto.is_private === true;
    const approvalStatus =
      isPrivate || user.role === 'ADMIN'
        ? EventApprovalStatus.APPROVED
        : EventApprovalStatus.PENDING;

    const event = await this.prisma.event.create({
      data: {
        title,
        slug: await this.uniqueSlug(title),
        description: dto.description?.trim() || null,
        venueName,
        startDate,
        endDate,
        capacity,
        allowWalkIns: dto.allow_walk_ins ?? false,
        isPrivate,
        approvalStatus,
        organizerId: user.id,
        category: dto.category ? normalizeCategoryName(dto.category) : null,
        tags: Array.isArray(dto.tags) ? dto.tags.map((t) => t.trim()).filter(Boolean) : [],
        bannerImageUrl: dto.banner_image_url ?? null,
        schedule: dto.schedule ? (dto.schedule as any) : undefined,
        speakers: dto.speakers ? (dto.speakers as any) : undefined,
      },
      include: {
        organizer: { select: { id: true, email: true, fullName: true, affiliation: true } },
      },
    });

    if (dto.organizerEmails && Array.isArray(dto.organizerEmails) && dto.organizerEmails.length > 0) {
      const cleanEmails = Array.from(
        new Set(
          dto.organizerEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => e && e !== user.email.toLowerCase()),
        ),
      );
      if (cleanEmails.length > 0) {
        const foundUsers = await this.prisma.user.findMany({
          where: { email: { in: cleanEmails } },
          select: { id: true, email: true },
        });
        const foundEmailSet = new Set(foundUsers.map((u) => u.email.toLowerCase()));
        const usedPasswords = new Set<string>();

        for (const em of cleanEmails) {
          if (!foundEmailSet.has(em)) {
            // Provision guest organizer account and send password setup invitation
            const temporaryPassword = this.generateUniqueTemporaryPassword(usedPasswords);
            const passwordHash = await bcrypt.hash(temporaryPassword, 10);
            const guestUser = await this.prisma.user.create({
              data: {
                email: em,
                passwordHash,
                fullName: em.split('@')[0],
                role: UserRole.ORGANIZER,
                isActive: true,
                mustChangePassword: true,
              },
              select: { id: true, email: true },
            });
            foundUsers.push(guestUser);
            foundEmailSet.add(em);

            await this.invitationMailer.sendOrganizerInvitation({
              eventTitle: event.title,
              email: em,
              temporaryPassword,
              invitedBy: user.fullName || user.email,
            });
          }
        }
        await this.prisma.eventOrganizer.createMany({
          data: foundUsers.map((u) => ({
            eventId: event.id,
            userId: u.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Process entrances, booths, and staff assignments from creation wizard
    const checkpointMap = new Map<string, { id: string; name: string }>();

    if (Array.isArray(dto.entrances) && dto.entrances.length > 0 && this.prisma.checkpoint) {
      for (const entrance of dto.entrances) {
        const entName = entrance.name?.trim();
        if (!entName) continue;
        const createdEntrance = await this.prisma.checkpoint.create({
          data: {
            eventId: event.id,
            name: entName,
            location: entrance.location?.trim() || null,
            type: CheckpointType.MAIN_ENTRY,
            allowMultipleScans: entrance.allowMultipleScans ?? false,
            requireMainEntry: false,
          },
        });
        checkpointMap.set(entName.toLowerCase(), createdEntrance);
      }
    }

    if (Array.isArray(dto.booths) && dto.booths.length > 0 && this.prisma.checkpoint) {
      for (const booth of dto.booths) {
        const boothName = booth.name?.trim();
        if (!boothName) continue;
        const createdBooth = await this.prisma.checkpoint.create({
          data: {
            eventId: event.id,
            name: boothName,
            location: booth.location?.trim() || null,
            type: CheckpointType.BOOTH,
            allowMultipleScans: booth.allowMultipleScans ?? true,
            requireMainEntry: booth.requireMainEntry ?? false,
          },
        });
        checkpointMap.set(boothName.toLowerCase(), createdBooth);
      }
    }

    if (Array.isArray(dto.staffAssignments) && dto.staffAssignments.length > 0) {
      for (const assignment of dto.staffAssignments) {
        const cleanEmail = assignment.email?.trim().toLowerCase();
        if (!cleanEmail) continue;
        let staffUser = await this.prisma.user.findUnique({
          where: { email: cleanEmail },
          select: { id: true, email: true },
        });
        if (!staffUser) {
          const temporaryPassword = this.generateUniqueTemporaryPassword(new Set());
          const passwordHash = await bcrypt.hash(temporaryPassword, 10);
          staffUser = await this.prisma.user.create({
            data: {
              email: cleanEmail,
              passwordHash,
              fullName: cleanEmail.split('@')[0],
              role: UserRole.STAFF,
              isActive: true,
              mustChangePassword: true,
            },
            select: { id: true, email: true },
          });
          await this.invitationMailer.sendOrganizerInvitation({
            eventTitle: event.title,
            email: cleanEmail,
            temporaryPassword,
            invitedBy: user.fullName || user.email,
          });
        }

        if (
          assignment.accessLevel === 'SPECIFIC_BOOTH' &&
          assignment.checkpointName &&
          this.prisma.checkpointStaff
        ) {
          const targetCheckpoint = checkpointMap.get(assignment.checkpointName.trim().toLowerCase());
          if (targetCheckpoint) {
            await this.prisma.checkpointStaff.upsert({
              where: {
                checkpointId_userId: {
                  checkpointId: targetCheckpoint.id,
                  userId: staffUser.id,
                },
              },
              update: { isActive: true },
              create: {
                checkpointId: targetCheckpoint.id,
                userId: staffUser.id,
                isActive: true,
              },
            });
            continue;
          }
        }

        if (this.prisma.eventStaff) {
          await this.prisma.eventStaff.upsert({
            where: {
              eventId_userId: {
                eventId: event.id,
                userId: staffUser.id,
              },
            },
            update: { isActive: true },
            create: {
              eventId: event.id,
              userId: staffUser.id,
              isActive: true,
            },
          });
        }
      }
    }

    const fullEvent = await this.prisma.event.findUnique({
      where: { id: event.id },
      include: {
        organizer: { select: { id: true, email: true, fullName: true, affiliation: true } },
        organizers: {
          include: {
            user: { select: { id: true, email: true, fullName: true, affiliation: true } },
          },
        },
      },
    });

    this.logger.log(`Event '${event.id}' created by ${user.id} (private: ${isPrivate}, approval: ${approvalStatus})`);
    return this.toOrganizerEvent(fullEvent ?? event, 0);
  }

    /** Soft delete: hides the event everywhere but keeps tickets and scan history. */
  async remove(user: UserSummaryDto, eventId: string): Promise<void> {
    const event = await this.findManageableEvent(user, eventId);
    if (user.role !== 'ADMIN' && event.organizerId !== user.id) {
      throw new ForbiddenException('Only the primary organizer can delete this event');
    }
    await this.prisma.event.update({
      where: { id: eventId },
      data: { deletedAt: new Date(), isActive: false },
    });
    this.logger.log(`Event '${eventId}' soft-deleted by ${user.id}`);
  }

  async update(
    user: UserSummaryDto,
    eventId: string,
    dto: UpdateEventDto,
  ): Promise<OrganizerEventDto> {
    const event = await this.findManageableEvent(user, eventId);
    const data: Prisma.EventUpdateInput = {};

    if (dto.name !== undefined) {
      data.title = this.requireText(dto.name, 'Event title is required');
    }

    if (dto.venue !== undefined) {
      data.venueName = this.requireText(dto.venue, 'Venue is required');
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.allow_walk_ins !== undefined) {
      data.allowWalkIns = Boolean(dto.allow_walk_ins);
    }

    if (dto.is_private !== undefined) {
      data.isPrivate = Boolean(dto.is_private);
    }

    if (dto.category !== undefined) {
      data.category = dto.category ? normalizeCategoryName(dto.category) : null;
    }

    if (dto.tags !== undefined && Array.isArray(dto.tags)) {
      data.tags = dto.tags.map((t) => t.trim()).filter(Boolean);
    }

    if (dto.banner_image_url !== undefined) {
      data.bannerImageUrl = dto.banner_image_url ? dto.banner_image_url.trim() : null;
    }

    if (dto.schedule !== undefined) {
      data.schedule = dto.schedule ? (dto.schedule as any) : null;
    }

    if (dto.speakers !== undefined) {
      data.speakers = dto.speakers ? (dto.speakers as any) : null;
    }

    const [startDate, endDate] = this.parseDateRange(
      dto.starts_at ?? event.startDate.toISOString(),
      dto.ends_at ?? event.endDate.toISOString(),
    );
    data.startDate = startDate;
    data.endDate = endDate;

    // Editing a rejected event resubmits it for admin review.
    if (
      user.role !== 'ADMIN' &&
      event.approvalStatus === EventApprovalStatus.REJECTED
    ) {
      data.approvalStatus = EventApprovalStatus.PENDING;
      data.reviewNotes = null;
      data.reviewedAt = null;
      data.reviewedBy = { disconnect: true };
    }

    const registrationsCount = await this.prisma.ticket.count({
      where: { eventId, ...ACTIVE_TICKET_FILTER },
    });

    if (dto.capacity !== undefined) {
      const capacity = this.parseCapacity(dto.capacity);
      if (capacity < registrationsCount) {
        throw new BadRequestException(
          `Capacity cannot be lower than current registrations (${registrationsCount})`,
        );
      }
      data.capacity = capacity;
    }

    if (dto.organizerEmails !== undefined && Array.isArray(dto.organizerEmails)) {
      const cleanEmails = Array.from(
        new Set(
          dto.organizerEmails
            .map((e) => (typeof e === 'string' ? e.trim().toLowerCase() : ''))
            .filter((e) => e && e !== user.email.toLowerCase()),
        ),
      );
      const targetUsers =
        cleanEmails.length > 0
          ? await this.prisma.user.findMany({
              where: { email: { in: cleanEmails } },
              select: { id: true, email: true },
            })
          : [];
      const foundEmailSet = new Set(targetUsers.map((u) => u.email.toLowerCase()));
      const usedPasswords = new Set<string>();
      for (const em of cleanEmails) {
        if (!foundEmailSet.has(em)) {
          const temporaryPassword = this.generateUniqueTemporaryPassword(usedPasswords);
          const passwordHash = await bcrypt.hash(temporaryPassword, 10);
          const guestUser = await this.prisma.user.create({
            data: {
              email: em,
              passwordHash,
              fullName: em.split('@')[0],
              role: UserRole.ORGANIZER,
              isActive: true,
              mustChangePassword: true,
            },
            select: { id: true, email: true },
          });
          targetUsers.push(guestUser);
          foundEmailSet.add(em);

          await this.invitationMailer.sendOrganizerInvitation({
            eventTitle: event.title,
            email: em,
            temporaryPassword,
            invitedBy: user.fullName || user.email,
          });
        }
      }
      const targetUserIds = targetUsers
        .map((u) => u.id)
        .filter((id) => id !== event.organizerId);

      await this.prisma.eventOrganizer.deleteMany({
        where: {
          eventId,
          userId: { notIn: targetUserIds },
        },
      });
      for (const uid of targetUserIds) {
        await this.prisma.eventOrganizer.upsert({
          where: { eventId_userId: { eventId, userId: uid } },
          create: { eventId, userId: uid },
          update: {},
        });
      }
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data,
      include: {
        organizer: { select: { id: true, email: true, fullName: true, affiliation: true } },
        organizers: {
          include: {
            user: { select: { id: true, email: true, fullName: true, affiliation: true } },
          },
        },
      },
    });

    return this.toOrganizerEvent(updated, registrationsCount);
  }

  /** Every event for the admin console, optionally filtered by approval status. */
  async findAllForAdmin(
    user: UserSummaryDto,
    status?: string,
  ): Promise<AdminEventDto[]> {
    this.assertAdminRole(user);

    let approvalStatus: EventApprovalStatus | undefined;
    if (status) {
      const normalized = status.toUpperCase();
      if (!(normalized in EventApprovalStatus)) {
        throw new BadRequestException(`Unknown approval status '${status}'`);
      }
      approvalStatus = normalized as EventApprovalStatus;
    }

    const events = await this.prisma.event.findMany({
      where: { deletedAt: null, ...(approvalStatus ? { approvalStatus } : {}) },
      include: ADMIN_EVENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return events.map((ev) => this.toAdminEvent(ev, ev._count.tickets));
  }

  async review(
    user: UserSummaryDto,
    eventId: string,
    dto: ReviewEventDto,
  ): Promise<AdminEventDto> {
    this.assertAdminRole(user);

    if (dto.decision !== 'APPROVED' && dto.decision !== 'REJECTED') {
      throw new BadRequestException(
        "Decision must be either 'APPROVED' or 'REJECTED'",
      );
    }
    const notes = dto.notes?.trim() || null;
    if (dto.decision === 'REJECTED' && !notes) {
      throw new BadRequestException(
        'Please provide a reason so the organizer can revise the event',
      );
    }

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        approvalStatus: dto.decision,
        reviewNotes: notes,
        reviewedAt: new Date(),
        reviewedById: user.id,
      },
      include: ADMIN_EVENT_INCLUDE,
    });

    this.logger.log(`Event '${eventId}' ${dto.decision} by ${user.id}`);
    return this.toAdminEvent(updated, updated._count.tickets);
  }

  async findRegistrants(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<EventRegistrantDto[]> {
    await this.findAccessibleEvent(user, eventId);

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((ticket) => this.toRegistrant(ticket));
  }

    async getEventProgress(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<RegistrantProgressDto[]> {
    const event = await this.findAccessibleEvent(user, eventId);
    return computeEventProgress(this.prisma, {
      id: event.id,
      title: event.title,
    });
  }

  async toggleCheckIn(
    user: UserSummaryDto,
    eventId: string,
    registrantId: string,
  ): Promise<EventRegistrantDto> {
    await this.findAccessibleEvent(user, eventId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: registrantId, eventId },
    });
    if (!ticket) {
      throw new NotFoundException(`Registrant '${registrantId}' not found`);
    }
    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException(
        'Cancelled registrations cannot be checked in',
      );
    }

    const now = new Date();
    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data:
        ticket.status === TicketStatus.CHECKED_IN
          ? { status: TicketStatus.REGISTERED }
          : {
              status: TicketStatus.CHECKED_IN,
              firstScannedAt: ticket.firstScannedAt ?? now,
              lastScannedAt: now,
            },
    });

    return this.toRegistrant(updated);
  }

  async cancelRegistrant(
    user: UserSummaryDto,
    eventId: string,
    registrantId: string,
  ): Promise<EventRegistrantDto> {
    await this.findManageableEvent(user, eventId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: registrantId, eventId },
    });
    if (!ticket) {
      throw new NotFoundException(`Registrant '${registrantId}' not found`);
    }
    if (ticket.status === TicketStatus.CANCELLED) {
      throw new BadRequestException('Registration is already cancelled');
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.CANCELLED },
    });

    return this.toRegistrant(updated);
  }

  async restoreRegistrant(
    user: UserSummaryDto,
    eventId: string,
    registrantId: string,
  ): Promise<EventRegistrantDto> {
    const event = await this.findManageableEvent(user, eventId);

    const ticket = await this.prisma.ticket.findFirst({
      where: { id: registrantId, eventId },
    });
    if (!ticket) {
      throw new NotFoundException(`Registrant '${registrantId}' not found`);
    }
    if (ticket.status !== TicketStatus.CANCELLED) {
      throw new BadRequestException(
        'Only cancelled registrations can be restored',
      );
    }

    if (event.capacity) {
      const spotsTaken = await this.prisma.ticket.count({
        where: { eventId, status: { not: TicketStatus.CANCELLED } },
      });
      if (spotsTaken >= event.capacity) {
        throw new BadRequestException(
          'Event is at full capacity. Cannot restore registration.',
        );
      }
    }

    const updated = await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: TicketStatus.REGISTERED },
    });

    return this.toRegistrant(updated);
  }

  private assertOrganizerRole(_user: UserSummaryDto): void {
    // Dynamic event roles: permissions are evaluated per-event in findManageableEvent
  }

  private assertAdminRole(user: UserSummaryDto): void {
    if (user.role !== 'ADMIN') {
      throw new ForbiddenException('Only administrators can review events');
    }
  }

  private requireText(value: string | undefined, message: string): string {
    const text = value?.trim();
    if (!text) throw new BadRequestException(message);
    return text;
  }

  private parseDateRange(startsAt?: string, endsAt?: string): [Date, Date] {
    const startDate = new Date(startsAt ?? '');
    const endDate = new Date(endsAt ?? '');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException('Please provide valid start and end dates');
    }
    if (endDate <= startDate) {
      throw new BadRequestException(
        'End date & time must be after the start date & time',
      );
    }
    return [startDate, endDate];
  }

  private parseCapacity(value: unknown): number {
    const capacity = Number(value);
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new BadRequestException('Capacity must be a positive whole number');
    }
    return capacity;
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'event';

    let slug = base;
    while (await this.prisma.event.findUnique({ where: { slug } })) {
      slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    }
    return slug;
  }

  private async findManageableEvent(user: UserSummaryDto, eventId: string) {
    this.assertOrganizerRole(user);

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        organizers: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }
    const isOrganizer =
      event.organizerId === user.id ||
      event.organizers.some((o) => o.userId === user.id);
    if (user.role !== 'ADMIN' && !isOrganizer) {
      throw new ForbiddenException('You do not manage this event');
    }
    return event;
  }

  private toOrganizerEvent(
    ev: Event & {
      organizer?: { id?: string; fullName: string; email: string; affiliation?: string | null };
      organizers?: Array<{
        id: string;
        userId: string;
        assignedAt: Date;
        user?: { id: string; email: string; fullName: string; affiliation?: string | null };
      }>;
    },
    registrationsCount: number,
  ): OrganizerEventDto {
    const now = new Date();
    const status: OrganizerEventStatus =
      now < ev.startDate
        ? 'Upcoming'
        : now <= ev.endDate
          ? 'In progress'
          : 'Completed';

    const organizersList: EventOrganizerDto[] = [];
    if (ev.organizer) {
      const orgId = ev.organizer.id ?? ev.organizerId;
      organizersList.push({
        id: `primary-${orgId}`,
        userId: orgId,
        email: ev.organizer.email,
        fullName: ev.organizer.fullName,
        affiliation: ev.organizer.affiliation ?? null,
        assignedAt: ev.createdAt.toISOString(),
        isPrimary: true,
      });
    }
    if (ev.organizers && Array.isArray(ev.organizers)) {
      for (const org of ev.organizers) {
        if (org.userId !== ev.organizerId && org.user) {
          organizersList.push({
            id: org.id,
            userId: org.user.id,
            email: org.user.email,
            fullName: org.user.fullName,
            affiliation: org.user.affiliation ?? null,
            assignedAt: org.assignedAt ? org.assignedAt.toISOString() : new Date().toISOString(),
            isPrimary: false,
          });
        }
      }
    }

    return {
      id: ev.id,
      organizer_id: ev.organizerId,
      name: ev.title,
      starts_at: ev.startDate.toISOString(),
      ends_at: ev.endDate.toISOString(),
      venue: ev.venueName,
      registrations_count: registrationsCount,
      capacity: ev.capacity,
      status,
      description: ev.description ?? '',
      allow_walk_ins: ev.allowWalkIns,
      approval_status: APPROVAL_STATUS_LABELS[ev.approvalStatus],
      review_notes: ev.reviewNotes,
      reviewed_at: ev.reviewedAt?.toISOString() ?? null,
      submitted_at: ev.createdAt.toISOString(),
      is_private: ev.isPrivate,
      category: ev.category ? normalizeCategoryName(ev.category) : undefined,
      category_label: ev.category ? normalizeCategoryName(ev.category) : undefined,
      tags: ev.tags ?? [],
      banner_image_url:
        ev.bannerImageUrl ??
        (ev.slug ? this.resolveBannerImage(ev.slug, ev.category || 'Conference') : null),
      schedule:
        (ev.schedule && Array.isArray(ev.schedule) && (ev.schedule as any[]).length > 0)
          ? (ev.schedule as unknown as EventScheduleItemDto[])
          : ev.slug
            ? this.buildScheduleTimeline({ slug: ev.slug, checkpoints: (ev as any).checkpoints || [] })
            : undefined,
      speakers: (ev as any).speakers && Array.isArray((ev as any).speakers) ? (ev as any).speakers : undefined,
      ...(organizersList.length > 0 ? { organizers: organizersList } : {}),
    };
  }

  private toAdminEvent(
    ev: Event & { organizer: { fullName: string; email: string; id?: string } },
    registrationsCount: number,
  ): AdminEventDto {
    return {
      ...this.toOrganizerEvent(ev, registrationsCount),
      organizer_name: ev.organizer.fullName,
      organizer_email: ev.organizer.email,
    };
  }

  private toRegistrant(ticket: {
    id: string;
    eventId: string;
    userId: string | null;
    firstName: string;
    lastName: string;
    email: string;
    ticketCode: string;
    createdAt: Date;
    status: TicketStatus;
  }): EventRegistrantDto {
    return {
      id: ticket.id,
      event_id: ticket.eventId,
      attendee_id: ticket.userId,
      full_name: `${ticket.firstName} ${ticket.lastName}`.trim(),
      email: ticket.email,
      ticket_id: ticket.ticketCode,
      registered_at: ticket.createdAt.toISOString(),
      status: REGISTRANT_STATUS_LABELS[ticket.status],
    };
  }

  async findAccessibleEvent(user: UserSummaryDto, eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        staff: true,
        organizers: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }
    if (user.role === 'ADMIN') return event;
    if (event.organizerId === user.id) return event;
    if (event.organizers?.some((o) => o.userId === user.id)) return event;
    const isAssignedStaff = event.staff?.some(
      (s) => s.userId === user.id && s.isActive,
    );
    if (isAssignedStaff) return event;

    if (this.prisma.checkpointStaff?.findFirst) {
      const checkpointStaff = await this.prisma.checkpointStaff.findFirst({
        where: {
          userId: user.id,
          isActive: true,
          checkpoint: { eventId, deletedAt: null, isActive: true },
        },
      });
      if (checkpointStaff) return event;
    }

    throw new ForbiddenException('You do not have access to this event');
  }

  async getLiveOverview(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<EventLiveOverviewDto> {
    const event = await this.findAccessibleEvent(user, eventId);

    const totalRsvps = await this.prisma.ticket.count({
      where: { eventId, status: { not: TicketStatus.CANCELLED } },
    });
    const checkedInAttendees = await this.prisma.ticket.count({
      where: { eventId, status: TicketStatus.CHECKED_IN },
    });

    const checkpoints = await this.prisma.checkpoint.findMany({
      where: { eventId, isActive: true, deletedAt: null },
      include: {
        _count: {
          select: { attendanceLogs: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const totalVerifiedScans = await this.prisma.attendanceLog.count({
      where: { checkpoint: { eventId } },
    });

    const recentLogs = await this.prisma.attendanceLog.findMany({
      where: { checkpoint: { eventId } },
      include: {
        checkpoint: true,
        ticket: true,
      },
      orderBy: { scannedAt: 'desc' },
      take: 20,
    });

    const allLogs = await this.prisma.attendanceLog.findMany({
      where: { checkpoint: { eventId } },
      select: { scannedAt: true },
      orderBy: { scannedAt: 'asc' },
    });

    const hoursOrder = [
      '8:00 AM',
      '9:00 AM',
      '10:00 AM',
      '11:00 AM',
      '12:00 PM',
      '1:00 PM',
      '2:00 PM',
      '3:00 PM',
      '4:00 PM',
      '5:00 PM',
    ];
    const hourCounts: Record<string, number> = {};
    for (const h of hoursOrder) {
      hourCounts[h] = 0;
    }

    for (const log of allLogs) {
      const date = new Date(log.scannedAt);
      const hourNumber = date.getHours();
      const period = hourNumber >= 12 ? 'PM' : 'AM';
      const displayHour = hourNumber % 12 === 0 ? 12 : hourNumber % 12;
      const key = `${displayHour}:00 ${period}`;
      hourCounts[key] = (hourCounts[key] || 0) + 1;
    }

    const hourlyFlow: HourlyFlowPointDto[] = Object.keys(hourCounts).map(
      (hour) => ({
        hour,
        scans: hourCounts[hour],
      }),
    );

    const maxStationScans = Math.max(
      ...checkpoints.map((c) => c._count.attendanceLogs),
      1,
    );

    const stationTraffic: StationTrafficDto[] = checkpoints.map((c) => ({
      id: c.id,
      name: c.name,
      type:
        c.type === 'MAIN_ENTRY'
          ? 'Main Entrance'
          : c.type === 'SESSION'
            ? 'Session'
            : c.type === 'BOOTH'
              ? 'Booth'
              : 'Exit',
      scans: c._count.attendanceLogs,
      percentage: Math.round((c._count.attendanceLogs / maxStationScans) * 100),
    }));

    const recentScans: RecentScanItemDto[] = recentLogs.map((log) =>
      this.toRecentScanItem(log),
    );

    const attendanceRate =
      totalRsvps > 0 ? Math.round((checkedInAttendees / totalRsvps) * 100) : 0;
    const venueOccupancy =
      event.capacity && event.capacity > 0
        ? Math.round((checkedInAttendees / event.capacity) * 100)
        : 0;

    const category = event.category ? normalizeCategoryName(event.category) : normalizeCategoryName(event.title);
    const categoryLabel = category;

    return {
      id: event.id,
      organizerId: event.organizerId,
      name: event.title,
      slug: event.slug,
      category,
      categoryLabel,
      capacity: event.capacity,
      venue: event.venueName,
      startsAt: event.startDate.toISOString(),
      endsAt: event.endDate.toISOString(),
      kpis: {
        totalRsvps,
        checkedInAttendees,
        attendanceRate,
        venueOccupancy,
        maxCapacity: event.capacity,
        activeStationsCount: checkpoints.length,
        totalVerifiedScans,
      },
      hourlyFlow,
      stationTraffic,
      recentScans,
      organizers: await this.getOrganizers(user, eventId),
    };
  }

  private toRecentScanItem(log: {
    id: string;
    ticketCode: string;
    scannedAt: Date;
    scanResult: string;
    checkpointId: string;
    checkpoint: { name: string };
    ticket: { firstName: string; lastName: string; affiliation: string | null } | null;
  }): RecentScanItemDto {
    return {
      id: log.id,
      attendeeName: log.ticket
        ? `${log.ticket.firstName} ${log.ticket.lastName}`.trim()
        : 'Guest Attendee',
      affiliation: log.ticket?.affiliation || 'General Attendee',
      ticketCode: log.ticketCode,
      stationId: log.checkpointId,
      stationName: log.checkpoint.name,
      scannedAt: log.scannedAt.toISOString(),
      status: log.scanResult,
      statusLabel:
        log.scanResult === 'SUCCESS'
          ? 'Checked In'
          : log.scanResult === 'DUPLICATE'
            ? 'Duplicate'
            : log.scanResult === 'WARNING_NO_MAIN_ENTRY'
              ? 'Warning: No Main Entry'
              : 'Invalid Ticket',
    };
  }

  /**
   * Scan log for the organizer Stream tab, newest first. Optional filters by
   * station and scan result; limit defaults to 100 (max 500).
   */
  async listScans(
    user: UserSummaryDto,
    eventId: string,
    filters: { checkpointId?: string; status?: string; limit?: number } = {},
  ): Promise<RecentScanItemDto[]> {
    await this.findAccessibleEvent(user, eventId);

    const validStatuses = ['SUCCESS', 'DUPLICATE', 'WARNING_NO_MAIN_ENTRY', 'INVALID_TICKET'];
    const status = filters.status && validStatuses.includes(filters.status)
      ? (filters.status as 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET')
      : undefined;
    const rawLimit = Number(filters.limit);
    const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 100;

    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        checkpoint: { eventId },
        ...(filters.checkpointId ? { checkpointId: filters.checkpointId } : {}),
        ...(status ? { scanResult: status } : {}),
      },
      include: { checkpoint: true, ticket: true },
      orderBy: { scannedAt: 'desc' },
      take,
    });

    return logs.map((log) => this.toRecentScanItem(log));
  }

  async getEventCheckpoints(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<EventCheckpointDto[]> {
    const event = await this.findAccessibleEvent(user, eventId);

    const checkpoints = await this.prisma.checkpoint.findMany({
      where: { eventId, isActive: true, deletedAt: null },
      orderBy: { name: 'asc' },
    });

    return checkpoints.map((c) => ({
      id: c.id,
      name: c.name,
      location: c.location,
      type: c.type,
      allowMultipleScans: c.allowMultipleScans,
      requireMainEntry: c.requireMainEntry,
      cooldownSeconds: resolveCheckpointCooldownSeconds(c),
      eventId: event.id,
      eventName: event.title,
      parentId: c.parentId ?? null,
    }));
  }

  async recordScan(
    user: UserSummaryDto,
    eventId: string,
    checkpointId: string,
    ticketCodeOrPayload:
      | string
      | { ticketCode?: string; faceDescriptor?: number[] },
  ): Promise<ScanResultDto> {
    await this.findAccessibleEvent(user, eventId);

    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { id: checkpointId, eventId, isActive: true, deletedAt: null },
    });
    if (!checkpoint) {
      throw new NotFoundException(
        `Checkpoint '${checkpointId}' not found for this event`,
      );
    }

    const payload =
      typeof ticketCodeOrPayload === 'string'
        ? { ticketCode: ticketCodeOrPayload }
        : ticketCodeOrPayload ?? {};

    const hasFace =
      Array.isArray(payload.faceDescriptor) && payload.faceDescriptor.length > 0;
    const hasTicket =
      typeof payload.ticketCode === 'string' &&
      payload.ticketCode.trim().length > 0;

    if (!hasFace && !hasTicket) {
      throw new BadRequestException(
        'Either ticketCode or faceDescriptor must be provided.',
      );
    }

    let ticketCodeToEvaluate = payload.ticketCode?.trim();
    let verificationMethod: 'QR' | 'FACE_ID' = 'QR';
    let faceConfidence: number | undefined;

    if (hasFace) {
      verificationMethod = 'FACE_ID';
      const descriptor = payload.faceDescriptor!;
      if (
        descriptor.length !== 128 ||
        descriptor.some((n) => typeof n !== 'number' || !Number.isFinite(n))
      ) {
        throw new BadRequestException(
          'Face descriptor must be an array of exactly 128 finite numbers',
        );
      }

      const attendeesWithFace = await this.prisma.ticket.findMany({
        where: {
          eventId,
          user: {
            faceRegisteredAt: { not: null },
          },
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              studentId: true,
              faceDescriptor: true,
            },
          },
        },
      });

      let bestMatch: {
        ticket: (typeof attendeesWithFace)[0];
        distance: number;
      } | null = null;
      let minDistance = Infinity;

      for (const t of attendeesWithFace) {
        const desc = t.user?.faceDescriptor;
        if (!desc || desc.length !== 128) continue;
        const dist = euclideanDistance(descriptor, desc);
        if (dist < minDistance) {
          minDistance = dist;
          bestMatch = { ticket: t, distance: dist };
        }
      }

      if (bestMatch && minDistance < FACE_MATCH_THRESHOLD) {
        ticketCodeToEvaluate = bestMatch.ticket.ticketCode;
        faceConfidence = Math.round(
          Math.max(
            60,
            Math.min(
              99,
              ((FACE_MATCH_THRESHOLD - minDistance) / FACE_MATCH_THRESHOLD) *
                39 +
                60,
            ),
          ),
        );
      } else {
        const notFoundMsg =
          'Face not recognized for any registered attendee of this event.';
        await this.prisma.attendanceLog.create({
          data: {
            ticketCode: 'FACE:UNKNOWN',
            checkpointId: checkpoint.id,
            scannedByUserId: user.id,
            scanResult: 'INVALID_TICKET',
            notes: notFoundMsg,
          },
        });
        throw new NotFoundException(notFoundMsg);
      }
    }

    const { outcome } = await evaluateCheckpointScan(this.prisma, {
      userId: user.id,
      checkpoint: {
        id: checkpoint.id,
        name: checkpoint.name,
        type: checkpoint.type,
        eventId: checkpoint.eventId,
        allowMultipleScans: checkpoint.allowMultipleScans,
        requireMainEntry: checkpoint.requireMainEntry,
      },
      ticketCode: ticketCodeToEvaluate!,
      notes:
        verificationMethod === 'FACE_ID'
          ? `Face ID verified (score: ${faceConfidence}%)`
          : undefined,
      verificationMethod,
      faceConfidence,
    });

    let progress: ProgressSummaryDto | null = null;
    if (
      outcome.attendee &&
      (outcome.scanResult === 'SUCCESS' || outcome.scanResult === 'DUPLICATE')
    ) {
      try {
        progress = await computeProgressSummaryForCode(
          this.prisma,
          outcome.attendee.ticketCode,
        );
      } catch (err) {
        this.logger.debug(`Progress summary unavailable: ${String(err)}`);
      }
    }

    return {
      ...(progress ? { progress } : {}),
      scanResult: outcome.scanResult,
      ticketCode: outcome.attendee?.ticketCode ?? ticketCodeToEvaluate!,
      attendeeName: outcome.attendee?.fullName,
      affiliation: outcome.affiliation,
      stationName: checkpoint.name,
      scannedAt: outcome.scannedAt,
      firstScannedAt: outcome.firstScannedAt,
      message: outcome.message,
      verificationMethod,
      faceConfidence,
      ...(outcome.cooldownActive !== undefined
        ? { cooldownActive: outcome.cooldownActive }
        : {}),
      ...(outcome.cooldownSeconds !== undefined
        ? { cooldownSeconds: outcome.cooldownSeconds }
        : {}),
      ...(outcome.cooldownRemainingSeconds !== undefined
        ? { cooldownRemainingSeconds: outcome.cooldownRemainingSeconds }
        : {}),
    };
  }

  async exportScansCsv(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<string> {
    await this.findAccessibleEvent(user, eventId);

    const logs = await this.prisma.attendanceLog.findMany({
      where: { checkpoint: { eventId } },
      include: {
        checkpoint: true,
        ticket: true,
        scannedBy: true,
      },
      orderBy: { scannedAt: 'desc' },
    });

    const headers = [
      'Ticket Code',
      'Attendee Name',
      'Email',
      'Affiliation',
      'Checkpoint',
      'Checkpoint Type',
      'Scan Result',
      'Scanned At',
      'Operator',
    ];

    const escapeCsv = (str: string) => `"${str.replace(/"/g, '""')}"`;

    const rows = logs.map((log) => {
      const name = log.ticket
        ? `${log.ticket.firstName} ${log.ticket.lastName}`.trim()
        : 'Guest';
      const email = log.ticket?.email ?? '';
      const affiliation = log.ticket?.affiliation ?? '';
      const checkpoint = log.checkpoint?.name ?? '';
      const type = log.checkpoint?.type ?? '';
      const result = log.scanResult;
      const scannedAt = log.scannedAt.toISOString();
      const operator = log.scannedBy?.fullName ?? 'Staff';

      return [
        escapeCsv(log.ticketCode),
        escapeCsv(name),
        escapeCsv(email),
        escapeCsv(affiliation),
        escapeCsv(checkpoint),
        escapeCsv(type),
        escapeCsv(result),
        escapeCsv(scannedAt),
        escapeCsv(operator),
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  async getStaff(user: UserSummaryDto, eventId: string): Promise<EventStaffDto[]> {
    await this.findAccessibleEvent(user, eventId);
    const [eventStaffList, checkpointStaffList] = await Promise.all([
      this.prisma.eventStaff.findMany({
        where: { eventId, isActive: true },
        include: {
          user: { select: { id: true, email: true, fullName: true, affiliation: true } },
        },
        orderBy: { assignedAt: 'desc' },
      }),
      this.prisma.checkpointStaff?.findMany
        ? this.prisma.checkpointStaff.findMany({
            where: { checkpoint: { eventId }, isActive: true },
            include: {
              user: { select: { id: true, email: true, fullName: true, affiliation: true } },
              checkpoint: { select: { id: true, name: true } },
            },
            orderBy: { assignedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const results: EventStaffDto[] = [];
    for (const s of eventStaffList) {
      results.push({
        id: s.id,
        userId: s.user.id,
        email: s.user.email,
        fullName: s.user.fullName,
        affiliation: s.user.affiliation,
        assignedAt: s.assignedAt.toISOString(),
        accessLevel: 'ALL_SCANNERS',
        checkpointId: null,
        checkpointName: null,
      });
    }

    for (const cs of checkpointStaffList) {
      results.push({
        id: cs.id,
        userId: cs.user.id,
        email: cs.user.email,
        fullName: cs.user.fullName,
        affiliation: cs.user.affiliation,
        assignedAt: cs.assignedAt.toISOString(),
        accessLevel: 'SPECIFIC_BOOTH',
        checkpointId: cs.checkpoint.id,
        checkpointName: cs.checkpoint.name,
      });
    }

    return results;
  }

  async addStaff(
    user: UserSummaryDto,
    eventId: string,
    email: string,
    accessLevel?: StaffAccessLevel,
    checkpointId?: string,
  ): Promise<EventStaffDto> {
    await this.findManageableEvent(user, eventId);
    const cleanEmail = email.trim().toLowerCase();
    const targetUser = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (!targetUser) {
      throw new NotFoundException(
        `User with email '${cleanEmail}' not found. They must register an account first.`,
      );
    }

    if (accessLevel === 'SPECIFIC_BOOTH' && checkpointId && this.prisma.checkpointStaff) {
      const checkpoint = await this.prisma.checkpoint.findFirst({
        where: { id: checkpointId, eventId, isActive: true, deletedAt: null },
      });
      if (!checkpoint) {
        throw new NotFoundException(`Checkpoint '${checkpointId}' not found in this event.`);
      }

      const assignment = await this.prisma.checkpointStaff.upsert({
        where: { checkpointId_userId: { checkpointId, userId: targetUser.id } },
        update: { isActive: true },
        create: { checkpointId, userId: targetUser.id, isActive: true },
        include: {
          user: { select: { id: true, email: true, fullName: true, affiliation: true } },
        },
      });

      return {
        id: assignment.id,
        userId: assignment.user.id,
        email: assignment.user.email,
        fullName: assignment.user.fullName,
        affiliation: assignment.user.affiliation,
        assignedAt: assignment.assignedAt.toISOString(),
        accessLevel: 'SPECIFIC_BOOTH',
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name,
      };
    }

    const assignment = await this.prisma.eventStaff.upsert({
      where: { eventId_userId: { eventId, userId: targetUser.id } },
      update: { isActive: true },
      create: { eventId, userId: targetUser.id, isActive: true },
      include: {
        user: { select: { id: true, email: true, fullName: true, affiliation: true } },
      },
    });

    return {
      id: assignment.id,
      userId: assignment.user.id,
      email: assignment.user.email,
      fullName: assignment.user.fullName,
      affiliation: assignment.user.affiliation,
      assignedAt: assignment.assignedAt.toISOString(),
      accessLevel: 'ALL_SCANNERS',
      checkpointId: null,
      checkpointName: null,
    };
  }

  async removeStaff(
    user: UserSummaryDto,
    eventId: string,
    targetUserId: string,
    checkpointId?: string,
  ): Promise<void> {
    await this.findManageableEvent(user, eventId);
    if (checkpointId && this.prisma.checkpointStaff) {
      await this.prisma.checkpointStaff.updateMany({
        where: { checkpointId, userId: targetUserId },
        data: { isActive: false },
      });
    } else {
      await Promise.all([
        this.prisma.eventStaff.updateMany({
          where: { eventId, userId: targetUserId },
          data: { isActive: false },
        }),
        this.prisma.checkpointStaff?.updateMany
          ? this.prisma.checkpointStaff.updateMany({
              where: { checkpoint: { eventId }, userId: targetUserId },
              data: { isActive: false },
            })
          : Promise.resolve(),
      ]);
    }
  }

  async getOrganizers(
    user: UserSummaryDto,
    eventId: string,
  ): Promise<EventOrganizerDto[]> {
    const event = await this.findAccessibleEvent(user, eventId);
    const [primaryUser, coOrganizers] = await Promise.all([
      this.prisma.user?.findUnique
        ? this.prisma.user.findUnique({
            where: { id: event.organizerId },
            select: { id: true, email: true, fullName: true, affiliation: true },
          })
        : Promise.resolve(null),
      this.prisma.eventOrganizer?.findMany
        ? this.prisma.eventOrganizer.findMany({
            where: { eventId },
            include: {
              user: { select: { id: true, email: true, fullName: true, affiliation: true } },
            },
            orderBy: { assignedAt: 'asc' },
          })
        : Promise.resolve([]),
    ]);

    const result: EventOrganizerDto[] = [];
    if (primaryUser) {
      result.push({
        id: `primary-${primaryUser.id}`,
        userId: primaryUser.id,
        email: primaryUser.email,
        fullName: primaryUser.fullName,
        affiliation: primaryUser.affiliation ?? null,
        assignedAt: event.createdAt.toISOString(),
        isPrimary: true,
      });
    }

    for (const co of coOrganizers) {
      if (co.userId !== event.organizerId && co.user) {
        result.push({
          id: co.id,
          userId: co.user.id,
          email: co.user.email,
          fullName: co.user.fullName,
          affiliation: co.user.affiliation ?? null,
          assignedAt: co.assignedAt.toISOString(),
          isPrimary: false,
        });
      }
    }
    return result;
  }

  async addOrganizer(
    user: UserSummaryDto,
    eventId: string,
    email: string,
  ): Promise<EventOrganizerDto> {
    const event = await this.findManageableEvent(user, eventId);
    const cleanEmail = email?.trim()?.toLowerCase();
    if (!cleanEmail) {
      throw new BadRequestException('Organizer email is required');
    }
    let targetUser = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
      select: { id: true, email: true, fullName: true, affiliation: true },
    });
    if (!targetUser) {
      const temporaryPassword = this.generateUniqueTemporaryPassword(new Set());
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      targetUser = await this.prisma.user.create({
        data: {
          email: cleanEmail,
          passwordHash,
          fullName: cleanEmail.split('@')[0],
          role: UserRole.ORGANIZER,
          isActive: true,
          mustChangePassword: true,
        },
        select: { id: true, email: true, fullName: true, affiliation: true },
      });

      await this.invitationMailer.sendOrganizerInvitation({
        eventTitle: event.title,
        email: cleanEmail,
        temporaryPassword,
        invitedBy: user.fullName || user.email,
      });
    }
    if (targetUser.id === event.organizerId) {
      throw new BadRequestException('This user is already the primary organizer');
    }
    const assignment = await this.prisma.eventOrganizer.upsert({
      where: { eventId_userId: { eventId, userId: targetUser.id } },
      update: {},
      create: { eventId, userId: targetUser.id },
      include: {
        user: { select: { id: true, email: true, fullName: true, affiliation: true } },
      },
    });

    return {
      id: assignment.id,
      userId: assignment.user.id,
      email: assignment.user.email,
      fullName: assignment.user.fullName,
      affiliation: assignment.user.affiliation ?? null,
      assignedAt: assignment.assignedAt.toISOString(),
      isPrimary: false,
    };
  }

  async removeOrganizer(
    user: UserSummaryDto,
    eventId: string,
    targetUserId: string,
  ): Promise<void> {
    const event = await this.findManageableEvent(user, eventId);
    if (event.organizerId === targetUserId) {
      throw new BadRequestException('Cannot remove the primary organizer');
    }
    await this.prisma.eventOrganizer.deleteMany({
      where: { eventId, userId: targetUserId },
    });
  }

  async searchOrganizerCandidates(
    user: UserSummaryDto,
    query: string,
  ): Promise<OrganizerCandidateDto[]> {
    this.assertOrganizerRole(user);
    const trimmed = (query || '').trim();
    if (trimmed.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { email: { contains: trimmed, mode: 'insensitive' } },
          { fullName: { contains: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true, email: true, fullName: true, affiliation: true },
      take: 8,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      affiliation: u.affiliation ?? null,
    }));
  }

  getCategories(): CategoryDefinition[] {
    return STANDARD_EVENT_CATEGORIES;
  }
}