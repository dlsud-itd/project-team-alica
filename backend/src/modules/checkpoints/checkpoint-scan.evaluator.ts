import { BadRequestException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';

export const DEFAULT_MULTI_SCAN_COOLDOWN_SECONDS = 30;

export function getDefaultCooldownSeconds(): number {
  const raw = process.env['SCAN_COOLDOWN_SECONDS'];
  if (!raw) return DEFAULT_MULTI_SCAN_COOLDOWN_SECONDS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MULTI_SCAN_COOLDOWN_SECONDS;
  }
  return Math.floor(parsed);
}

export function resolveCheckpointCooldownSeconds(
  checkpoint: { allowMultipleScans: boolean },
  overrideSeconds?: number,
): number {
  if (!checkpoint.allowMultipleScans) {
    return 0;
  }
  if (
    overrideSeconds !== undefined &&
    Number.isFinite(overrideSeconds) &&
    overrideSeconds >= 0
  ) {
    return Math.floor(overrideSeconds);
  }
  return getDefaultCooldownSeconds();
}

export function normalizeTicketCodeCandidates(rawCode: string): string[] {
  const trimmed = rawCode.trim();
  if (!trimmed) return [];

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const noHash = trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
  candidates.add(noHash);
  candidates.add(`#${noHash}`);

  // Handle URL payloads (e.g. https://domain.com/tickets/CHK-2026-9812A or ?code=CHK-2026-9812A)
  if (trimmed.includes('/') || trimmed.includes('?')) {
    try {
      const url = new URL(
        trimmed.startsWith('http') ? trimmed : `https://${trimmed}`,
      );
      const codeParam =
        url.searchParams.get('code') ||
        url.searchParams.get('ticket') ||
        url.searchParams.get('ticketCode');
      if (codeParam) {
        const clean = codeParam.trim();
        candidates.add(clean);
        candidates.add(clean.replace(/^#/, ''));
        candidates.add(`#${clean.replace(/^#/, '')}`);
      }
      const segments = url.pathname.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (lastSegment) {
        const clean = decodeURIComponent(lastSegment).trim();
        candidates.add(clean);
        candidates.add(clean.replace(/^#/, ''));
        candidates.add(`#${clean.replace(/^#/, '')}`);
      }
    } catch {
      // not a valid URL, ignore
    }
  }

  // Handle JSON payloads (e.g. {"ticketCode":"CHK-xxx"} or {"qrPayload":"..."})
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const extracted =
        parsed['ticketCode'] ||
        parsed['code'] ||
        parsed['ticket'] ||
        parsed['qrPayload'] ||
        parsed['id'];
      if (typeof extracted === 'string' && extracted.trim()) {
        const clean = extracted.trim();
        candidates.add(clean);
        candidates.add(clean.replace(/^#/, ''));
        candidates.add(`#${clean.replace(/^#/, '')}`);
      }
    } catch {
      // not valid JSON, ignore
    }
  }

  return Array.from(candidates).filter(Boolean);
}

export interface EvaluatedCheckpointMeta {
  id: string;
  name: string;
  type: 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
  eventId: string;
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
}

export interface EvaluatedScanOutcome {
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
  attendee: {
    fullName: string;
    studentId: string | null;
    ticketType: string;
    ticketCode: string;
  } | null;
  affiliation?: string;
  cooldownActive?: boolean;
  cooldownSeconds?: number;
  cooldownRemainingSeconds?: number;
}

export interface EvaluateScanResult {
  outcome: EvaluatedScanOutcome;
  httpStatus: 200 | 400 | 404 | 409;
  errorCode?:
    | 'INVALID_TICKET'
    | 'TICKET_CANCELLED'
    | 'DUPLICATE_SCAN'
    | 'COOLDOWN_ACTIVE';
}

export interface EvaluateScanInput {
  userId: string;
  checkpoint: EvaluatedCheckpointMeta;
  ticketCode: string;
  deviceInfo?: string;
  notes?: string;
  cooldownSeconds?: number;
}

export async function evaluateCheckpointScan(
  prisma: PrismaService,
  input: EvaluateScanInput,
): Promise<EvaluateScanResult> {
  const { checkpoint, userId } = input;
  const rawCode = input.ticketCode?.trim() ?? '';
  if (!rawCode) {
    throw new BadRequestException('Ticket code is required.');
  }

  const now = new Date();
  const checkpointMeta = {
    id: checkpoint.id,
    name: checkpoint.name,
    type: checkpoint.type,
  };
  const cooldownSeconds = resolveCheckpointCooldownSeconds(
    checkpoint,
    input.cooldownSeconds,
  );

  const candidates = normalizeTicketCodeCandidates(rawCode);
  const ticket = await prisma.ticket.findFirst({
    where: {
      eventId: checkpoint.eventId,
      OR: [
        ...candidates.map((candidate) => ({
          ticketCode: { equals: candidate, mode: 'insensitive' as const },
        })),
        ...candidates.map((candidate) => ({
          qrPayload: { equals: candidate, mode: 'insensitive' as const },
        })),
        ...candidates.map((candidate) => ({
          id: { equals: candidate },
        })),
      ],
    },
  });

  // 1. Invalid / Non-existent ticket
  if (!ticket) {
    const otherEventTicket = await prisma.ticket.findFirst({
      where: {
        OR: [
          ...candidates.map((candidate) => ({
            ticketCode: { equals: candidate, mode: 'insensitive' as const },
          })),
          ...candidates.map((candidate) => ({
            qrPayload: { equals: candidate, mode: 'insensitive' as const },
          })),
          ...candidates.map((candidate) => ({
            id: { equals: candidate },
          })),
        ],
      },
      include: { event: { select: { title: true } } },
    });

    const notFoundMessage = otherEventTicket
      ? `Ticket is registered for '${otherEventTicket.event.title}', not this event.`
      : 'Ticket code does not exist or is not valid for this event.';

    await prisma.attendanceLog.create({
      data: {
        ticketCode: rawCode,
        checkpointId: checkpoint.id,
        scannedByUserId: userId,
        scanResult: 'INVALID_TICKET',
        deviceInfo: input.deviceInfo ?? null,
        notes: input.notes ?? notFoundMessage,
      },
    });

    return {
      httpStatus: 404,
      errorCode: 'INVALID_TICKET',
      outcome: {
        scanResult: 'INVALID_TICKET',
        message: notFoundMessage,
        scannedAt: now.toISOString(),
        firstScannedAt: null,
        checkpoint: checkpointMeta,
        attendee: null,
      },
    };
  }

  const attendee = {
    fullName: `${ticket.firstName} ${ticket.lastName}`.trim(),
    studentId: ticket.studentId ?? null,
    ticketType: ticket.ticketType,
    ticketCode: ticket.ticketCode,
  };
  const affiliation = ticket.affiliation ?? undefined;

  // 2. Cancelled ticket
  if (ticket.status === TicketStatus.CANCELLED) {
    await prisma.attendanceLog.create({
      data: {
        ticketId: ticket.id,
        ticketCode: ticket.ticketCode,
        checkpointId: checkpoint.id,
        scannedByUserId: userId,
        scanResult: 'INVALID_TICKET',
        deviceInfo: input.deviceInfo ?? null,
        notes: input.notes ?? 'This registration was cancelled',
      },
    });

    return {
      httpStatus: 400,
      errorCode: 'TICKET_CANCELLED',
      outcome: {
        scanResult: 'INVALID_TICKET',
        message: 'This registration was cancelled.',
        scannedAt: now.toISOString(),
        firstScannedAt: null,
        checkpoint: checkpointMeta,
        attendee,
        affiliation,
      },
    };
  }

  // 3. Entry rule: require prior MAIN_ENTRY check-in
  if (checkpoint.requireMainEntry) {
    const mainEntryScan = await prisma.attendanceLog.findFirst({
      where: {
        ticketId: ticket.id,
        checkpoint: { eventId: checkpoint.eventId, type: 'MAIN_ENTRY' },
        scanResult: 'SUCCESS',
      },
    });

    if (!mainEntryScan) {
      await prisma.attendanceLog.create({
        data: {
          ticketId: ticket.id,
          ticketCode: ticket.ticketCode,
          checkpointId: checkpoint.id,
          scannedByUserId: userId,
          scanResult: 'WARNING_NO_MAIN_ENTRY',
          deviceInfo: input.deviceInfo ?? null,
          notes: input.notes ?? 'Attendee has not passed the main entrance',
        },
      });

      return {
        httpStatus: 200,
        outcome: {
          scanResult: 'WARNING_NO_MAIN_ENTRY',
          message: 'Attendee has not passed the main entrance.',
          scannedAt: now.toISOString(),
          firstScannedAt: null,
          checkpoint: checkpointMeta,
          attendee,
          affiliation,
          cooldownSeconds,
        },
      };
    }
  }

  // 4. Single-scan checkpoint duplicate guard
  if (!checkpoint.allowMultipleScans) {
    const priorScan = await prisma.attendanceLog.findFirst({
      where: {
        ticketId: ticket.id,
        checkpointId: checkpoint.id,
        scanResult: 'SUCCESS',
      },
      orderBy: { scannedAt: 'asc' },
    });

    if (priorScan) {
      await prisma.attendanceLog.create({
        data: {
          ticketId: ticket.id,
          ticketCode: ticket.ticketCode,
          checkpointId: checkpoint.id,
          scannedByUserId: userId,
          scanResult: 'DUPLICATE',
          deviceInfo: input.deviceInfo ?? null,
          notes:
            input.notes ?? 'Attendee has already checked in at this checkpoint',
        },
      });

      return {
        httpStatus: 409,
        errorCode: 'DUPLICATE_SCAN',
        outcome: {
          scanResult: 'DUPLICATE',
          message: 'Attendee has already checked in at this checkpoint.',
          scannedAt: now.toISOString(),
          firstScannedAt: priorScan.scannedAt.toISOString(),
          checkpoint: checkpointMeta,
          attendee,
          affiliation,
          cooldownSeconds: 0,
        },
      };
    }
  } else if (cooldownSeconds > 0) {
    // 5. Multi-scan cooldown guard
    const latestSuccess = await prisma.attendanceLog.findFirst({
      where: {
        ticketId: ticket.id,
        checkpointId: checkpoint.id,
        scanResult: 'SUCCESS',
      },
      orderBy: { scannedAt: 'desc' },
    });

    if (latestSuccess) {
      const elapsedMs = now.getTime() - latestSuccess.scannedAt.getTime();
      const cooldownMs = cooldownSeconds * 1000;
      if (elapsedMs >= 0 && elapsedMs < cooldownMs) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((cooldownMs - elapsedMs) / 1000),
        );
        const message = `Cooldown active. Please wait ${remainingSeconds}s before rescanning at this station.`;

        await prisma.attendanceLog.create({
          data: {
            ticketId: ticket.id,
            ticketCode: ticket.ticketCode,
            checkpointId: checkpoint.id,
            scannedByUserId: userId,
            scanResult: 'DUPLICATE',
            deviceInfo: input.deviceInfo ?? null,
            notes:
              input.notes ?? `Cooldown active (${remainingSeconds}s remaining)`,
          },
        });

        return {
          httpStatus: 409,
          errorCode: 'COOLDOWN_ACTIVE',
          outcome: {
            scanResult: 'DUPLICATE',
            message,
            scannedAt: now.toISOString(),
            firstScannedAt: latestSuccess.scannedAt.toISOString(),
            checkpoint: checkpointMeta,
            attendee,
            affiliation,
            cooldownActive: true,
            cooldownSeconds,
            cooldownRemainingSeconds: remainingSeconds,
          },
        };
      }
    }
  }

  // 6. Valid scan
  const defaultSuccessNote =
    checkpoint.type === 'BOOTH'
      ? 'Booth scan'
      : checkpoint.type === 'EXIT'
        ? 'Exit scan'
        : 'Check-in successful';

  await prisma.attendanceLog.create({
    data: {
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      checkpointId: checkpoint.id,
      scannedByUserId: userId,
      scanResult: 'SUCCESS',
      deviceInfo: input.deviceInfo ?? null,
      notes: input.notes ?? defaultSuccessNote,
    },
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      status: TicketStatus.CHECKED_IN,
      firstScannedAt: ticket.firstScannedAt ?? now,
      lastScannedAt: now,
    },
  });

  const successMessage =
    checkpoint.type === 'EXIT' ? 'Exit scan recorded' : 'Check-in successful';

  return {
    httpStatus: 200,
    outcome: {
      scanResult: 'SUCCESS',
      message: successMessage,
      scannedAt: now.toISOString(),
      firstScannedAt: null,
      checkpoint: checkpointMeta,
      attendee,
      affiliation,
      cooldownSeconds,
    },
  };
}
