import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import { TicketStatus } from '@prisma/client';

export interface StaffCheckpointDto {
  id: string;
  name: string;
  location: string | null;
  type: 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  eventId: string;
  eventName: string;
  parentId: string | null;
}

export interface ScanAttendeeDto {
  fullName: string;
  studentId: string | null;
  ticketType: string;
  ticketCode: string;
}

export interface ScanOutcomeDto {
  scanResult: 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';
  message: string;
  scannedAt: string;
  firstScannedAt: string | null;
  checkpoint: {
    id: string;
    name: string;
    type: 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
  };
  attendee: ScanAttendeeDto | null;
}

export class ScanRequestBodyDto {
  ticketCode!: string;
  deviceInfo?: string;
  notes?: string;
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
  event: { title: string };
};

@Injectable()
export class CheckpointsService {
  constructor(private readonly prisma: PrismaService) {}

  private toStaffDto(c: CheckpointWithEvent): StaffCheckpointDto {
    return {
      id: c.id,
      name: c.name,
      location: c.location,
      type: c.type,
      allowMultipleScans: c.allowMultipleScans,
      requireMainEntry: c.requireMainEntry,
      eventId: c.eventId,
      eventName: c.event.title,
      parentId: c.parentId ?? null,
    };
  }

  async findMyCheckpoints(user: UserSummaryDto): Promise<StaffCheckpointDto[]> {
    if (user.role === 'ADMIN') {
      const allActive = await this.prisma.checkpoint.findMany({
        where: { isActive: true, deletedAt: null },
        include: { event: { select: { title: true } } },
        orderBy: { name: 'asc' },
      });

      return allActive.map((c) => this.toStaffDto(c));
    }

    // For non-admin users, only return explicitly assigned checkpoints:
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

    if (directIds.length === 0 && eventIds.length === 0) {
      return [];
    }

    const checkpoints = await this.prisma.checkpoint.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [
          ...(directIds.length ? [{ id: { in: directIds } }] : []),
          // Sub-booths follow their parent booth's assignment
          ...(directIds.length ? [{ parentId: { in: directIds } }] : []),
          ...(eventIds.length ? [{ eventId: { in: eventIds } }] : []),
        ],
      },
      include: { event: { select: { title: true } } },
      orderBy: { name: 'asc' },
    });

    return checkpoints.map((c) => this.toStaffDto(c));
  }
  async createSubBooth(parentId: string, dto: CreateSubBoothDto): Promise<StaffCheckpointDto> {
    const name = dto.name?.trim();
    if (!name) {
      throw new BadRequestException('Sub-booth name is required.');
    }

    const parent = await this.prisma.checkpoint.findFirst({
      where: { id: parentId, type: 'BOOTH', isActive: true, deletedAt: null },
    });
    if (!parent) {
      throw new NotFoundException(`Booth '${parentId}' not found.`);
    }
    if (parent.parentId) {
      throw new BadRequestException('A sub-booth cannot have its own sub-booths.');
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

    const rawCode = dto.ticketCode?.trim() ?? '';
    const codeNoHash = rawCode.startsWith('#') ? rawCode.slice(1).trim() : rawCode;
    const codeWithHash = `#${codeNoHash}`;
    const now = new Date();

    const checkpointMeta = {
      id: checkpoint.id,
      name: checkpoint.name,
      type: checkpoint.type,
    };

    // Find ticket in event
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        eventId: checkpoint.eventId,
        OR: [
          { ticketCode: { equals: rawCode, mode: 'insensitive' } },
          { ticketCode: { equals: codeNoHash, mode: 'insensitive' } },
          { ticketCode: { equals: codeWithHash, mode: 'insensitive' } },
        ],
      },
    });

    // 1. Invalid / Non-existent ticket
    if (!ticket) {
      await this.prisma.attendanceLog.create({
        data: {
          ticketCode: rawCode,
          checkpointId: checkpoint.id,
          scannedByUserId: user.id,
          scanResult: 'INVALID_TICKET',
          deviceInfo: dto.deviceInfo ?? null,
          notes: dto.notes ?? 'Ticket code does not exist or is not valid for this event',
        },
      });

      throw new NotFoundException({
        success: false,
        statusCode: 404,
        error: 'INVALID_TICKET',
        message: 'Ticket code does not exist or is not valid for this event.',
        data: {
          scanResult: 'INVALID_TICKET',
          message: 'Ticket code does not exist or is not valid for this event.',
          scannedAt: now.toISOString(),
          firstScannedAt: null,
          checkpoint: checkpointMeta,
          attendee: null,
        },
      });
    }

    const attendee: ScanAttendeeDto = {
      fullName: `${ticket.firstName} ${ticket.lastName}`.trim(),
      studentId: ticket.studentId ?? null,
      ticketType: ticket.ticketType,
      ticketCode: ticket.ticketCode,
    };

    // 2. Cancelled ticket
    if (ticket.status === TicketStatus.CANCELLED) {
      await this.prisma.attendanceLog.create({
        data: {
          ticketId: ticket.id,
          ticketCode: ticket.ticketCode,
          checkpointId: checkpoint.id,
          scannedByUserId: user.id,
          scanResult: 'INVALID_TICKET',
          deviceInfo: dto.deviceInfo ?? null,
          notes: dto.notes ?? 'This registration was cancelled',
        },
      });

      throw new BadRequestException({
        success: false,
        statusCode: 400,
        error: 'TICKET_CANCELLED',
        message: 'This registration was cancelled.',
        data: {
          scanResult: 'INVALID_TICKET',
          message: 'This registration was cancelled.',
          scannedAt: now.toISOString(),
          firstScannedAt: null,
          checkpoint: checkpointMeta,
          attendee,
        },
      });
    }

    // 3. requireMainEntry check (e.g. Session or specific Booth check)
    if (checkpoint.requireMainEntry) {
      const mainEntryScan = await this.prisma.attendanceLog.findFirst({
        where: {
          ticketId: ticket.id,
          checkpoint: { eventId: checkpoint.eventId, type: 'MAIN_ENTRY' },
          scanResult: 'SUCCESS',
        },
      });

      if (!mainEntryScan) {
        await this.prisma.attendanceLog.create({
          data: {
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            checkpointId: checkpoint.id,
            scannedByUserId: user.id,
            scanResult: 'WARNING_NO_MAIN_ENTRY',
            deviceInfo: dto.deviceInfo ?? null,
            notes: dto.notes ?? 'Attendee has not passed the main entrance',
          },
        });

        return {
          scanResult: 'WARNING_NO_MAIN_ENTRY',
          message: 'Attendee has not passed the main entrance.',
          scannedAt: now.toISOString(),
          firstScannedAt: null,
          checkpoint: checkpointMeta,
          attendee,
        };
      }
    }

    // 4. Duplicate scan check on single-scan checkpoints
    // If allowMultipleScans is false, a repeat scan triggers DUPLICATE
    if (!checkpoint.allowMultipleScans) {
      const priorScan = await this.prisma.attendanceLog.findFirst({
        where: {
          ticketId: ticket.id,
          checkpointId: checkpoint.id,
          scanResult: 'SUCCESS',
        },
        orderBy: { scannedAt: 'asc' },
      });

      if (priorScan) {
        await this.prisma.attendanceLog.create({
          data: {
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            checkpointId: checkpoint.id,
            scannedByUserId: user.id,
            scanResult: 'DUPLICATE',
            deviceInfo: dto.deviceInfo ?? null,
            notes: dto.notes ?? 'Attendee has already checked in at this checkpoint',
          },
        });

        throw new ConflictException({
          success: false,
          statusCode: 409,
          error: 'DUPLICATE_SCAN',
          message: 'Attendee has already checked in at this checkpoint.',
          data: {
            scanResult: 'DUPLICATE',
            message: 'Attendee has already checked in at this checkpoint.',
            scannedAt: now.toISOString(),
            firstScannedAt: priorScan.scannedAt.toISOString(),
            checkpoint: checkpointMeta,
            attendee,
          },
        });
      }
    }

    // 5. Valid check-in / Booth scan (allows multiple scans when allowMultipleScans: true)
    await this.prisma.attendanceLog.create({
      data: {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        checkpointId: checkpoint.id,
        scannedByUserId: user.id,
        scanResult: 'SUCCESS',
        deviceInfo: dto.deviceInfo ?? null,
        notes: dto.notes ?? (checkpoint.type === 'BOOTH' ? 'Booth scan' : 'Check-in successful'),
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
      message: 'Check-in successful',
      scannedAt: now.toISOString(),
      firstScannedAt: null,
      checkpoint: checkpointMeta,
      attendee,
    };
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