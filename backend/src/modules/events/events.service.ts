import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import {
  Event,
  EventApprovalStatus,
  Prisma,
  TicketType,
  TicketStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import { GuestInvitationMailer } from './guest-invitation-mailer.service.js';

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
  category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  categoryLabel: string;
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
  category?: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  category_label?: string;
  checkpoints_count?: number;
  admitted_count?: number;
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
  stationName: string;
  scannedAt: string;
  status: string;
  statusLabel: string;
}

export interface EventLiveOverviewDto {
  id: string;
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
}

export interface EventCheckpointDto {
  id: string;
  name: string;
  location: string | null;
  type: string;
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  eventId: string;
  eventName: string;
}

export interface ScanResultDto {
  scanResult: 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';
  ticketCode: string;
  attendeeName?: string;
  affiliation?: string;
  stationName?: string;
  scannedAt: string;
  message: string;
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

export class UpdateEventDto {
  name?: string;
  description?: string;
  venue?: string;
  starts_at?: string;
  ends_at?: string;
  capacity?: number;
  allow_walk_ins?: boolean;
}

export class CreateEventDto {
  name!: string;
  description?: string;
  venue!: string;
  starts_at!: string;
  ends_at!: string;
  capacity!: number;
  allow_walk_ins?: boolean;
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
  organizer: { select: { fullName: true, email: true } },
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
      const ticketCode = `CHK-${randomUUID().toUpperCase()}`;
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

      // Infer category from title/slug
      const lowerSlug = (ev.slug + ' ' + ev.title).toLowerCase();
      let category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO' =
        'CONFERENCE';
      let categoryLabel = 'Conference';

      if (lowerSlug.includes('hackathon') || lowerSlug.includes('sprint')) {
        category = 'HACKATHON';
        categoryLabel = 'Hackathon';
      } else if (
        lowerSlug.includes('workshop') ||
        lowerSlug.includes('masterclass')
      ) {
        category = 'WORKSHOP';
        categoryLabel = 'Workshop';
      } else if (lowerSlug.includes('expo') || lowerSlug.includes('showcase')) {
        category = 'EXPO';
        categoryLabel = 'Expo';
      }

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
      };
    });
  }

  /** Events the user organizes (admins see every active event). */
  async findForOrganizer(user: UserSummaryDto): Promise<OrganizerEventDto[]> {
    this.assertOrganizerRole(user);

    const events = await this.prisma.event.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(user.role === 'ADMIN' ? {} : { organizerId: user.id }),
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
      },
      orderBy: { startDate: 'asc' },
    });

    return events.map((ev) => {
      const base = this.toOrganizerEvent(ev, ev._count.tickets);
      let category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO' = 'CONFERENCE';
      let category_label = 'Conference';
      const lowerTitle = ev.title.toLowerCase();
      if (lowerTitle.includes('hackathon')) {
        category = 'HACKATHON';
        category_label = 'Hackathon';
      } else if (lowerTitle.includes('workshop')) {
        category = 'WORKSHOP';
        category_label = 'Workshop';
      } else if (lowerTitle.includes('expo') || lowerTitle.includes('demo')) {
        category = 'EXPO';
        category_label = 'Expo';
      }

      return {
        ...base,
        category,
        category_label,
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
        approvalStatus: EventApprovalStatus.PENDING,
        organizerId: user.id,
      },
    });

    this.logger.log(`Event '${event.id}' submitted for review by ${user.id}`);
    return this.toOrganizerEvent(event, 0);
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

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data,
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
    await this.findManageableEvent(user, eventId);

    const tickets = await this.prisma.ticket.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
    });

    return tickets.map((ticket) => this.toRegistrant(ticket));
  }

  async toggleCheckIn(
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

  private assertOrganizerRole(user: UserSummaryDto): void {
    if (user.role !== 'ORGANIZER' && user.role !== 'ADMIN') {
      throw new ForbiddenException('Only organizers can manage events');
    }
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
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }
    if (user.role !== 'ADMIN' && event.organizerId !== user.id) {
      throw new ForbiddenException('You do not manage this event');
    }
    return event;
  }

  private toOrganizerEvent(
    ev: Event,
    registrationsCount: number,
  ): OrganizerEventDto {
    const now = new Date();
    const status: OrganizerEventStatus =
      now < ev.startDate
        ? 'Upcoming'
        : now <= ev.endDate
          ? 'In progress'
          : 'Completed';

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
    };
  }

  private toAdminEvent(
    ev: Event & { organizer: { fullName: string; email: string } },
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
      },
    });
    if (!event) {
      throw new NotFoundException(`Event with ID '${eventId}' not found`);
    }
    if (user.role === 'ADMIN') return event;
    if (user.role === 'ORGANIZER' && event.organizerId === user.id) return event;
    const isAssignedStaff = event.staff?.some(
      (s) => s.userId === user.id && s.isActive,
    );
    if (user.role === 'STAFF' && isAssignedStaff) return event;

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

    const recentScans: RecentScanItemDto[] = recentLogs.map((log) => ({
      id: log.id,
      attendeeName: log.ticket
        ? `${log.ticket.firstName} ${log.ticket.lastName}`.trim()
        : 'Guest Attendee',
      affiliation: log.ticket?.affiliation || 'General Attendee',
      ticketCode: log.ticketCode,
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
    }));

    const attendanceRate =
      totalRsvps > 0 ? Math.round((checkedInAttendees / totalRsvps) * 100) : 0;
    const venueOccupancy =
      event.capacity && event.capacity > 0
        ? Math.round((checkedInAttendees / event.capacity) * 100)
        : 0;

    let category = 'CONFERENCE';
    let categoryLabel = 'Conference';
    const lowerTitle = event.title.toLowerCase();
    if (lowerTitle.includes('hackathon')) {
      category = 'HACKATHON';
      categoryLabel = 'Hackathon';
    } else if (lowerTitle.includes('workshop')) {
      category = 'WORKSHOP';
      categoryLabel = 'Workshop';
    } else if (lowerTitle.includes('expo') || lowerTitle.includes('demo')) {
      category = 'EXPO';
      categoryLabel = 'Expo';
    }

    return {
      id: event.id,
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
    };
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
      eventId: event.id,
      eventName: event.title,
    }));
  }

  async recordScan(
    user: UserSummaryDto,
    eventId: string,
    checkpointId: string,
    ticketCode: string,
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

    const cleanCode = ticketCode.trim();
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        eventId,
        OR: [{ ticketCode: cleanCode }, { ticketCode: `#${cleanCode}` }],
      },
    });

    const now = new Date();

    if (!ticket) {
      await this.prisma.attendanceLog.create({
        data: {
          ticketCode: cleanCode,
          checkpointId,
          scannedByUserId: user.id,
          scanResult: 'INVALID_TICKET',
          notes: 'Ticket not found for this event',
        },
      });
      return {
        scanResult: 'INVALID_TICKET',
        ticketCode: cleanCode,
        stationName: checkpoint.name,
        scannedAt: now.toISOString(),
        message: 'Invalid ticket code for this event',
      };
    }

    if (ticket.status === TicketStatus.CANCELLED) {
      await this.prisma.attendanceLog.create({
        data: {
          ticketId: ticket.id,
          ticketCode: ticket.ticketCode,
          checkpointId,
          scannedByUserId: user.id,
          scanResult: 'INVALID_TICKET',
          notes: 'Ticket was cancelled',
        },
      });
      return {
        scanResult: 'INVALID_TICKET',
        ticketCode: ticket.ticketCode,
        attendeeName: `${ticket.firstName} ${ticket.lastName}`.trim(),
        affiliation: ticket.affiliation ?? undefined,
        stationName: checkpoint.name,
        scannedAt: now.toISOString(),
        message: 'This registration has been cancelled',
      };
    }

    if (checkpoint.requireMainEntry) {
      const mainEntryLog = await this.prisma.attendanceLog.findFirst({
        where: {
          ticketId: ticket.id,
          checkpoint: { eventId, type: 'MAIN_ENTRY' },
          scanResult: 'SUCCESS',
        },
      });
      if (!mainEntryLog) {
        await this.prisma.attendanceLog.create({
          data: {
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            checkpointId,
            scannedByUserId: user.id,
            scanResult: 'WARNING_NO_MAIN_ENTRY',
            notes: 'Attendee has not scanned at a main entry gate yet',
          },
        });
        return {
          scanResult: 'WARNING_NO_MAIN_ENTRY',
          ticketCode: ticket.ticketCode,
          attendeeName: `${ticket.firstName} ${ticket.lastName}`.trim(),
          affiliation: ticket.affiliation ?? undefined,
          stationName: checkpoint.name,
          scannedAt: now.toISOString(),
          message: 'Attendee has not checked in at the main gate yet',
        };
      }
    }

    if (!checkpoint.allowMultipleScans) {
      const priorScan = await this.prisma.attendanceLog.findFirst({
        where: {
          ticketId: ticket.id,
          checkpointId,
          scanResult: 'SUCCESS',
        },
      });
      if (priorScan) {
        await this.prisma.attendanceLog.create({
          data: {
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            checkpointId,
            scannedByUserId: user.id,
            scanResult: 'DUPLICATE',
            notes: 'Already checked in at this station',
          },
        });
        return {
          scanResult: 'DUPLICATE',
          ticketCode: ticket.ticketCode,
          attendeeName: `${ticket.firstName} ${ticket.lastName}`.trim(),
          affiliation: ticket.affiliation ?? undefined,
          stationName: checkpoint.name,
          scannedAt: now.toISOString(),
          message: 'Already checked in at this station',
        };
      }
    }

    await this.prisma.attendanceLog.create({
      data: {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        checkpointId,
        scannedByUserId: user.id,
        scanResult: 'SUCCESS',
      },
    });

    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.CHECKED_IN,
        firstScannedAt: ticket.firstScannedAt ?? now,
        lastScannedAt: now,
      },
    });

    return {
      scanResult: 'SUCCESS',
      ticketCode: ticket.ticketCode,
      attendeeName: `${ticket.firstName} ${ticket.lastName}`.trim(),
      affiliation: ticket.affiliation ?? undefined,
      stationName: checkpoint.name,
      scannedAt: now.toISOString(),
      message: 'Check-in successful',
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
}
