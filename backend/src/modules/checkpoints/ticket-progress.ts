import type { CheckpointType } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import { normalizeTicketCodeCandidates } from './checkpoint-scan.evaluator.js';

/**
 * Checkpoint types that count as a "stamp" on an attendee's event passport.
 * Main entry and exit gates are logistics, not booths, so they are excluded.
 */
export const STAMP_CHECKPOINT_TYPES: CheckpointType[] = ['BOOTH', 'SESSION'];

export interface TicketStampDto {
  checkpointId: string;
  name: string;
  location: string | null;
  type: CheckpointType;
  parentId: string | null;
  visited: boolean;
  firstVisitedAt: string | null;
}

export interface ProgressSummaryDto {
  visitedCount: number;
  totalCount: number;
  percent: number;
  completed: boolean;
}

export interface TicketProgressDto extends ProgressSummaryDto {
  ticketCode: string;
  eventId: string;
  eventName: string;
  stamps: TicketStampDto[];
}

type TicketForAccess = {
  id: string;
  ticketCode: string;
  eventId: string;
  userId: string | null;
  email: string;
  event: { title: string; organizerId: string };
};

/** Finds a ticket by any accepted code format (with/without '#', URL or JSON payload). */
export async function findTicketByAnyCode(
  prisma: PrismaService,
  rawCode: string,
): Promise<TicketForAccess | null> {
  const candidates = normalizeTicketCodeCandidates(rawCode);
  if (candidates.length === 0) return null;

  return prisma.ticket.findFirst({
    where: {
      OR: candidates.map((code) => ({
        ticketCode: { equals: code, mode: 'insensitive' as const },
      })),
    },
    select: {
      id: true,
      ticketCode: true,
      eventId: true,
      userId: true,
      email: true,
      event: { select: { title: true, organizerId: true } },
    },
  });
}

/**
 * A ticket's scan data is visible to: its owner, admins, the event's
 * organizers/co-organizers, and staff assigned to the event or one of its checkpoints.
 */
export async function canViewTicket(
  prisma: PrismaService,
  user: UserSummaryDto,
  ticket: TicketForAccess,
): Promise<boolean> {
  if (user.role === 'ADMIN') return true;
  if (ticket.userId === user.id) return true;
  if (ticket.email.toLowerCase() === user.email.toLowerCase()) return true;
  if (ticket.event.organizerId === user.id) return true;

  const [coOrganizer, eventStaff, checkpointStaff] = await Promise.all([
    prisma.eventOrganizer.findFirst({
      where: { eventId: ticket.eventId, userId: user.id },
      select: { id: true },
    }),
    prisma.eventStaff.findFirst({
      where: { eventId: ticket.eventId, userId: user.id, isActive: true },
      select: { id: true },
    }),
    prisma.checkpointStaff.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        checkpoint: { eventId: ticket.eventId },
      },
      select: { id: true },
    }),
  ]);

  return Boolean(coOrganizer || eventStaff || checkpointStaff);
}

export function summarizeProgress(
  visitedCount: number,
  totalCount: number,
): ProgressSummaryDto {
  const percent =
    totalCount === 0 ? 0 : Math.round((visitedCount / totalCount) * 100);
  return {
    visitedCount,
    totalCount,
    percent,
    completed: totalCount > 0 && visitedCount >= totalCount,
  };
}

/**
 * Builds the stamp card for a ticket: every active booth/session checkpoint of the
 * ticket's event, marked visited when it has at least one SUCCESS scan for this ticket.
 * Duplicate scans never add stamps.
 */
export async function computeTicketProgress(
  prisma: PrismaService,
  ticket: Pick<TicketForAccess, 'id' | 'ticketCode' | 'eventId' | 'event'>,
): Promise<TicketProgressDto> {
  const [checkpoints, successLogs] = await Promise.all([
    prisma.checkpoint.findMany({
      where: {
        eventId: ticket.eventId,
        isActive: true,
        deletedAt: null,
        type: { in: STAMP_CHECKPOINT_TYPES },
      },
      select: {
        id: true,
        name: true,
        location: true,
        type: true,
        parentId: true,
      },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    }),
    prisma.attendanceLog.findMany({
      where: {
        scanResult: 'SUCCESS',
        checkpoint: { eventId: ticket.eventId },
        OR: [
          { ticketId: ticket.id },
          { ticketCode: { equals: ticket.ticketCode, mode: 'insensitive' } },
        ],
      },
      select: { checkpointId: true, scannedAt: true },
      orderBy: { scannedAt: 'asc' },
    }),
  ]);

  const firstVisit = new Map<string, Date>();
  for (const log of successLogs) {
    if (!firstVisit.has(log.checkpointId)) {
      firstVisit.set(log.checkpointId, log.scannedAt);
    }
  }

  const stamps: TicketStampDto[] = checkpoints.map((c) => {
    const visitedAt = firstVisit.get(c.id) ?? null;
    return {
      checkpointId: c.id,
      name: c.name,
      location: c.location,
      type: c.type,
      parentId: c.parentId ?? null,
      visited: visitedAt !== null,
      firstVisitedAt: visitedAt ? visitedAt.toISOString() : null,
    };
  });

  const visitedCount = stamps.filter((s) => s.visited).length;

  return {
    ticketCode: ticket.ticketCode,
    eventId: ticket.eventId,
    eventName: ticket.event.title,
    stamps,
    ...summarizeProgress(visitedCount, stamps.length),
  };
}

/** Short progress summary for a scanned ticket code; null if the ticket can't be found. */
export async function computeProgressSummaryForCode(
  prisma: PrismaService,
  ticketCode: string,
): Promise<ProgressSummaryDto | null> {
  const ticket = await findTicketByAnyCode(prisma, ticketCode);
  if (!ticket) return null;
  const progress = await computeTicketProgress(prisma, ticket);
  return summarizeProgress(progress.visitedCount, progress.totalCount);
}
