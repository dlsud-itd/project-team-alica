import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import {
  evaluateCheckpointScan,
  resolveCheckpointCooldownSeconds,
  type EvaluatedScanOutcome,
} from './checkpoint-scan.evaluator.js';
import {
  canViewTicket,
  computeProgressSummaryForCode,
  findTicketByAnyCode,
  type ProgressSummaryDto,
} from './ticket-progress.js';

export interface StaffCheckpointDto {
  id: string;
  name: string;
  location: string | null;
  type: 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  cooldownSeconds: number;
  eventId: string;
  eventName: string;
  parentId: string | null;
}

export interface StationDetailsDto extends StaffCheckpointDto {
  subBooths: StaffCheckpointDto[];
  totalScans: number;
}

export interface ScanAttendeeDto {
  fullName: string;
  studentId: string | null;
  ticketType: string;
  ticketCode: string;
}

export interface ScanOutcomeDto {
  scanResult:
    'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';
  message: string;
  scannedAt: string;
  firstScannedAt: string | null;
  checkpoint: {
    id: string;
    name: string;
    type: 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
  };
  attendee: ScanAttendeeDto | null;
  cooldownActive?: boolean;
  cooldownSeconds?: number;
  cooldownRemainingSeconds?: number;
  /** Attendee's booth stamp progress, present on SUCCESS/DUPLICATE scans. */
  progress?: ProgressSummaryDto;
  verificationMethod?: 'QR' | 'FACE_ID';
  faceConfidence?: number;
}

export class ScanRequestBodyDto {
  ticketCode?: string;
  faceDescriptor?: number[];
  deviceInfo?: string;
  notes?: string;
  cooldownSeconds?: number;
}

export class CreateSubBoothDto {
  name!: string;
  location?: string;
  allowMultipleScans?: boolean;
}

type CheckpointWithEvent = {
  id: string;
  name: string;
  location: string | null;
  type: StaffCheckpointDto['type'];
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  eventId: string;
  parentId: string | null;
  event: { title: string; organizerId?: string };
};

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export const FACE_MATCH_THRESHOLD = 0.6;

@Injectable()
export class CheckpointsService {
  private readonly logger = new Logger(CheckpointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private toStaffDto(c: CheckpointWithEvent): StaffCheckpointDto {
    return {
      id: c.id,
      name: c.name,
      location: c.location,
      type: c.type,
      allowMultipleScans: c.allowMultipleScans,
      requireMainEntry: c.requireMainEntry,
      cooldownSeconds: resolveCheckpointCooldownSeconds(c),
      eventId: c.eventId,
      eventName: c.event.title,
      parentId: c.parentId ?? null,
    };
  }

  private toScanOutcomeDto(outcome: EvaluatedScanOutcome): ScanOutcomeDto {
    return {
      scanResult: outcome.scanResult,
      message: outcome.message,
      scannedAt: outcome.scannedAt,
      firstScannedAt: outcome.firstScannedAt,
      checkpoint: outcome.checkpoint,
      attendee: outcome.attendee,
      ...(outcome.cooldownActive !== undefined
        ? { cooldownActive: outcome.cooldownActive }
        : {}),
      ...(outcome.cooldownSeconds !== undefined
        ? { cooldownSeconds: outcome.cooldownSeconds }
        : {}),
      ...(outcome.cooldownRemainingSeconds !== undefined
        ? { cooldownRemainingSeconds: outcome.cooldownRemainingSeconds }
        : {}),
      ...(outcome.verificationMethod !== undefined
        ? { verificationMethod: outcome.verificationMethod }
        : {}),
      ...(outcome.faceConfidence !== undefined
        ? { faceConfidence: outcome.faceConfidence }
        : {}),
    };
  }

  /**
   * Stamp-card summary for the scanned attendee. Best effort: a failure here must
   * never block or fail the scan itself.
   */
  private async safeProgressSummary(
    outcome: ScanOutcomeDto,
  ): Promise<ProgressSummaryDto | null> {
    if (
      !outcome.attendee ||
      (outcome.scanResult !== 'SUCCESS' && outcome.scanResult !== 'DUPLICATE')
    ) {
      return null;
    }
    try {
      return await computeProgressSummaryForCode(
        this.prisma,
        outcome.attendee.ticketCode,
      );
    } catch (err) {
      this.logger.debug(
        `Progress summary unavailable for ${outcome.attendee.ticketCode}: ${String(err)}`,
      );
      return null;
    }
  }

  private async assertStationAccess(
    user: UserSummaryDto,
    checkpoint: CheckpointWithEvent,
  ): Promise<void> {
    if (user.role === 'ADMIN') return;
    if (checkpoint.event?.organizerId === user.id) return;

    if (this.prisma.eventOrganizer?.findFirst) {
      const coOrg = await this.prisma.eventOrganizer.findFirst({
        where: { eventId: checkpoint.eventId, userId: user.id },
      });
      if (coOrg) return;
    }

    const [directAssignments, eventAssignments] = await Promise.all([
      this.prisma.checkpointStaff.findMany({
        where: { userId: user.id, isActive: true },
        select: { checkpointId: true },
      }),
      this.prisma.eventStaff.findMany({
        where: { userId: user.id, isActive: true },
        select: { eventId: true },
      }),
    ]);

    const directIds = new Set(directAssignments.map((a) => a.checkpointId));
    const eventIds = new Set(eventAssignments.map((a) => a.eventId));

    const hasDirect =
      directIds.has(checkpoint.id) ||
      (checkpoint.parentId !== null && directIds.has(checkpoint.parentId));
    const hasEventAccess = eventIds.has(checkpoint.eventId);

    if (!hasDirect && !hasEventAccess) {
      this.logger.warn(
        `Unauthorized station access attempt: user=${user.id} booth=${checkpoint.id}`,
      );
      throw new ForbiddenException(
        'You are not assigned to operate this station.',
      );
    }
  }

  async findMyCheckpoints(user: UserSummaryDto): Promise<StaffCheckpointDto[]> {
    return this.findUserCheckpoints(user, false);
  }

  async findAccessibleCheckpoints(
    user: UserSummaryDto,
  ): Promise<StaffCheckpointDto[]> {
    return this.findUserCheckpoints(user, true);
  }

  async findStationById(
    user: UserSummaryDto,
    boothId: string,
  ): Promise<StationDetailsDto> {
    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { id: boothId, isActive: true, deletedAt: null },
      include: { event: { select: { title: true, organizerId: true } } },
    });

    if (!checkpoint) {
      throw new NotFoundException(`Checkpoint '${boothId}' not found.`);
    }

    await this.assertStationAccess(user, checkpoint);

    const [subBoothRows, totalScans] = await Promise.all([
      this.prisma.checkpoint.findMany({
        where: { parentId: boothId, isActive: true, deletedAt: null },
        include: { event: { select: { title: true, organizerId: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.attendanceLog.count({
        where: { checkpointId: boothId, scanResult: 'SUCCESS' },
      }),
    ]);

    return {
      ...this.toStaffDto(checkpoint),
      subBooths: subBoothRows.map((sub) => this.toStaffDto(sub)),
      totalScans,
    };
  }

  private async findUserCheckpoints(
    user: UserSummaryDto,
    includeOwnedEvents: boolean,
  ): Promise<StaffCheckpointDto[]> {
    if (user.role === 'ADMIN') {
      const allActive = await this.prisma.checkpoint.findMany({
        where: { isActive: true, deletedAt: null },
        include: { event: { select: { title: true } } },
        orderBy: { name: 'asc' },
      });

      return allActive.map((c) => this.toStaffDto(c));
    }

    // For non-admin users, return explicitly assigned checkpoints
    // (and checkpoints for events they organize when requested):
    // 1. Direct checkpoint assignments
    const directAssignments = await this.prisma.checkpointStaff.findMany({
      where: { userId: user.id, isActive: true },
      select: { checkpointId: true },
    });
    const directIds = directAssignments.map((a) => a.checkpointId);

    // 2. Events where staff is assigned
    const eventAssignments = await this.prisma.eventStaff.findMany({
      where: { userId: user.id, isActive: true },
      select: { eventId: true },
    });
    const eventIds = eventAssignments.map((a) => a.eventId);

    if (
      !includeOwnedEvents &&
      directIds.length === 0 &&
      eventIds.length === 0
    ) {
      return [];
    }

    let coOrganizedEventIds: string[] = [];
    if (includeOwnedEvents && this.prisma.eventOrganizer?.findMany) {
      const coOrganizedEvents = await this.prisma.eventOrganizer.findMany({
        where: { userId: user.id },
        select: { eventId: true },
      });
      coOrganizedEventIds = coOrganizedEvents.map((e) => e.eventId);
    }

    const orFilters = [
      ...(directIds.length ? [{ id: { in: directIds } }] : []),
      // Sub-booths follow their parent booth's assignment
      ...(directIds.length ? [{ parentId: { in: directIds } }] : []),
      ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
      ...(includeOwnedEvents
        ? [
            { event: { organizerId: user.id, deletedAt: null } },
            ...(coOrganizedEventIds.length
              ? [{ eventId: { in: coOrganizedEventIds }, event: { deletedAt: null } }]
              : []),
          ]
        : []),
    ];

    if (orFilters.length === 0) {
      return [];
    }

    const checkpoints = await this.prisma.checkpoint.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: orFilters,
      },
      include: { event: { select: { title: true } } },
      orderBy: { name: 'asc' },
    });

    return checkpoints.map((c) => this.toStaffDto(c));
  }

  async createSubBooth(
    user: UserSummaryDto,
    parentId: string,
    dto: CreateSubBoothDto,
  ): Promise<StaffCheckpointDto> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Sub-booth name is required.');
    }

    const parent = await this.prisma.checkpoint.findFirst({
      where: { id: parentId, type: 'BOOTH', isActive: true, deletedAt: null },
      include: { event: { select: { organizerId: true } } },
    });
    if (!parent) {
      throw new NotFoundException(`Booth '${parentId}' not found.`);
    }
    if (user.role !== 'ADMIN' && parent.event?.organizerId !== user.id) {
      let isCoOrganizer = false;
      if (this.prisma.eventOrganizer?.findFirst) {
        const coOrg = await this.prisma.eventOrganizer.findFirst({
          where: { eventId: parent.eventId, userId: user.id },
        });
        if (coOrg) isCoOrganizer = true;
      }
      if (!isCoOrganizer) {
        throw new ForbiddenException('Only organizers can add sub-booths.');
      }
    }
    if (parent.parentId) {
      throw new BadRequestException(
        'A sub-booth cannot have its own sub-booths.',
      );
    }

    const created = await this.prisma.checkpoint.create({
      data: {
        name,
        location: dto.location?.trim() || parent.location,
        type: 'BOOTH',
        eventId: parent.eventId,
        parentId: parent.id,
        allowMultipleScans: dto.allowMultipleScans ?? parent.allowMultipleScans,
        requireMainEntry: parent.requireMainEntry,
      },
      include: { event: { select: { title: true } } },
    });

    this.logger.log(
      `Created sub-booth '${created.id}' under parent '${parent.id}' by user '${user.id}'`,
    );

    return this.toStaffDto(created);
  }

  async scan(
    user: UserSummaryDto,
    checkpointId: string,
    dto: ScanRequestBodyDto,
  ): Promise<ScanOutcomeDto> {
    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { id: checkpointId, isActive: true, deletedAt: null },
      include: { event: true },
    });

    if (!checkpoint) {
      throw new NotFoundException(`Checkpoint '${checkpointId}' not found.`);
    }

    await this.assertStationAccess(user, checkpoint);

    const hasFace = Array.isArray(dto.faceDescriptor) && dto.faceDescriptor.length > 0;
    const hasTicket = typeof dto.ticketCode === 'string' && dto.ticketCode.trim().length > 0;

    if (!hasFace && !hasTicket) {
      throw new BadRequestException(
        'Either ticketCode or faceDescriptor must be provided.',
      );
    }

    let ticketCodeToEvaluate = dto.ticketCode?.trim();
    let verificationMethod: 'QR' | 'FACE_ID' = 'QR';
    let faceConfidence: number | undefined;

    if (hasFace) {
      verificationMethod = 'FACE_ID';
      const descriptor = dto.faceDescriptor!;
      if (
        descriptor.length !== 128 ||
        descriptor.some((n) => typeof n !== 'number' || !Number.isFinite(n))
      ) {
        throw new BadRequestException(
          'Face descriptor must be an array of exactly 128 finite numbers',
        );
      }

      // Find attendees of this event who have registered Face ID
      const attendeesWithFace = await this.prisma.ticket.findMany({
        where: {
          eventId: checkpoint.eventId,
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

      let bestMatch: { ticket: (typeof attendeesWithFace)[0]; distance: number } | null = null;
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
              ((FACE_MATCH_THRESHOLD - minDistance) / FACE_MATCH_THRESHOLD) * 39 + 60,
            ),
          ),
        );
      } else {
        // Face not recognized for this event. Check if face belongs to any user in system
        const allUsersWithFace = await this.prisma.user.findMany({
          where: { faceRegisteredAt: { not: null } },
          select: { id: true, fullName: true, faceDescriptor: true },
        });

        let anyUserMatch: { user: (typeof allUsersWithFace)[0]; distance: number } | null = null;
        for (const u of allUsersWithFace) {
          if (u.faceDescriptor?.length === 128) {
            const d = euclideanDistance(descriptor, u.faceDescriptor);
            if (d < FACE_MATCH_THRESHOLD && (!anyUserMatch || d < anyUserMatch.distance)) {
              anyUserMatch = { user: u, distance: d };
            }
          }
        }

        const notFoundMsg = anyUserMatch
          ? `Face recognized for ${anyUserMatch.user.fullName}, but no valid ticket found for this event.`
          : 'Face not recognized. Please scan a QR pass or register Face ID.';

        await this.prisma.attendanceLog.create({
          data: {
            ticketCode: anyUserMatch ? `FACE:${anyUserMatch.user.id.slice(0, 8)}` : 'FACE:UNKNOWN',
            checkpointId: checkpoint.id,
            scannedByUserId: user.id,
            scanResult: 'INVALID_TICKET',
            deviceInfo: dto.deviceInfo ?? null,
            notes: notFoundMsg,
          },
        });

        const outcomeDto: ScanOutcomeDto = {
          scanResult: 'INVALID_TICKET',
          message: notFoundMsg,
          scannedAt: new Date().toISOString(),
          firstScannedAt: null,
          checkpoint: {
            id: checkpoint.id,
            name: checkpoint.name,
            type: checkpoint.type,
          },
          attendee: null,
          verificationMethod: 'FACE_ID',
        };

        throw new NotFoundException({
          success: false,
          statusCode: 404,
          error: 'FACE_NOT_MATCHED',
          message: notFoundMsg,
          data: outcomeDto,
        });
      }
    }

    const evaluated = await evaluateCheckpointScan(this.prisma, {
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
      deviceInfo: dto.deviceInfo,
      notes:
        dto.notes ??
        (verificationMethod === 'FACE_ID'
          ? `Face ID verified (score: ${faceConfidence}%)`
          : undefined),
      cooldownSeconds: dto.cooldownSeconds,
      verificationMethod,
      faceConfidence,
    });

    const outcomeDto = this.toScanOutcomeDto(evaluated.outcome);
    const progress = await this.safeProgressSummary(outcomeDto);
    if (progress) {
      outcomeDto.progress = progress;
    }

    if (evaluated.httpStatus === 404) {
      throw new NotFoundException({
        success: false,
        statusCode: 404,
        error: evaluated.errorCode ?? 'INVALID_TICKET',
        message: outcomeDto.message,
        data: outcomeDto,
      });
    }

    if (evaluated.httpStatus === 400) {
      throw new BadRequestException({
        success: false,
        statusCode: 400,
        error: evaluated.errorCode ?? 'TICKET_CANCELLED',
        message: outcomeDto.message,
        data: outcomeDto,
      });
    }

    if (evaluated.httpStatus === 409) {
      if (evaluated.errorCode === 'COOLDOWN_ACTIVE') {
        this.logger.debug(
          `Cooldown blocked scan: booth=${checkpoint.id} ticket=${ticketCodeToEvaluate} remaining=${outcomeDto.cooldownRemainingSeconds}s`,
        );
      }
      throw new ConflictException({
        success: false,
        statusCode: 409,
        error: evaluated.errorCode ?? 'DUPLICATE_SCAN',
        message: outcomeDto.message,
        data: outcomeDto,
      });
    }

    return outcomeDto;
  }

  async getAttendeeHistory(user: UserSummaryDto, ticketCode: string) {
    const ticket = await findTicketByAnyCode(this.prisma, ticketCode);
    if (!ticket) {
      // Logs for unknown codes (invalid-ticket scans) are admin-only.
      if (user.role !== 'ADMIN') {
        throw new NotFoundException(`Ticket '${ticketCode}' not found.`);
      }
    } else if (!(await canViewTicket(this.prisma, user, ticket))) {
      throw new ForbiddenException(
        'You do not have access to this attendee’s scan history.',
      );
    }

    const raw = ticketCode.trim();
    const codeNoHash = raw.startsWith('#') ? raw.slice(1).trim() : raw;
    const codeWithHash = `#${codeNoHash}`;

    const logs = await this.prisma.attendanceLog.findMany({
      where: {
        OR: [
          { ticketCode: { equals: raw, mode: 'insensitive' } },
          { ticketCode: { equals: codeNoHash, mode: 'insensitive' } },
          { ticketCode: { equals: codeWithHash, mode: 'insensitive' } },
        ],
      },
      include: {
        checkpoint: {
          select: { id: true, name: true, type: true, location: true },
        },
      },
      orderBy: { scannedAt: 'desc' },
    });

    return {
      ticketCode: raw,
      scans: logs.map((l) => ({
        id: l.id,
        checkpointName: l.checkpoint.name,
        checkpointType: l.checkpoint.type,
        location: l.checkpoint.location,
        scannedAt: l.scannedAt.toISOString(),
        scanResult: l.scanResult,
      })),
    };
  }
}
