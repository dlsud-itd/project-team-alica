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
}

export class ScanRequestBodyDto {
  ticketCode!: string;
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
    };
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
      ticketCode: dto.ticketCode,
      deviceInfo: dto.deviceInfo,
      notes: dto.notes,
      cooldownSeconds: dto.cooldownSeconds,
    });

    const outcomeDto = this.toScanOutcomeDto(evaluated.outcome);

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
          `Cooldown blocked scan: booth=${checkpoint.id} ticket=${dto.ticketCode} remaining=${outcomeDto.cooldownRemainingSeconds}s`,
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

  async getAttendeeHistory(ticketCode: string) {
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
