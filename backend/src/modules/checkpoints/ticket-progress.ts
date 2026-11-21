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

type StampCheckpointRow = {
  id: string;
  name: string;
  location: string | null;
  type: CheckpointType;
  parentId: string | null;
};

/** Active booth/session checkpoints of an event. Same for every registrant. */
function findStampCheckpoints(prisma: PrismaService, eventId: string) {
  return prisma.checkpoint.findMany({
    where: {
      eventId,
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
  });
}

function buildStamps(
  checkpoints: StampCheckpointRow[],
  firstVisit: Map<string, Date>,
): TicketStampDto[] {
  return checkpoints.map((c) => {
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
}
export async function computeTicketProgress(
  prisma: PrismaService,
  ticket: Pick<TicketForAccess, 'id' | 'ticketCode' | 'eventId' | 'event'>,
): Promise<TicketProgressDto> {
  const [checkpoints, successLogs] = await Promise.all([
    findStampCheckpoints(prisma, ticket.eventId),
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

  const stamps = buildStamps(checkpoints, firstVisit);

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

export interface RegistrantProgressDto extends TicketProgressDto {
  /** Ticket row id. Same as `id` in GET /events/:eventId/registrants. */
  ticketId: string;
}

/**
 * Progress of EVERY ticket of an event in a fixed number of queries
 * (tickets, checkpoints, success logs), no matter how many registrants.
 */
export async function computeEventProgress(
  prisma: PrismaService,
  event: { id: string; title: string },
): Promise<RegistrantProgressDto[]> {
  const [tickets, checkpoints, successLogs] = await Promise.all([
    prisma.ticket.findMany({
      where: { eventId: event.id },
      select: { id: true, ticketCode: true },
      orderBy: { createdAt: 'desc' },
    }),
    findStampCheckpoints(prisma, event.id),
    prisma.attendanceLog.findMany({
      where: { scanResult: 'SUCCESS', checkpoint: { eventId: event.id } },
      select: {
        ticketId: true,
        ticketCode: true,
        checkpointId: true,
        scannedAt: true,
      },
      orderBy: { scannedAt: 'asc' },
    }),
  ]);

  // Same matching rule as computeTicketProgress: by ticketId, or by code (case-insensitive).
  const byId = new Map(tickets.map((t) => [t.id, t] as const));
  const byCode = new Map(
    tickets.map((t) => [t.ticketCode.toLowerCase(), t] as const),
  );

  // ticketId -> (checkpointId -> first successful visit)
  const firstVisits = new Map<string, Map<string, Date>>();
  for (const log of successLogs) {
    const ticket =
      (log.ticketId ? byId.get(log.ticketId) : undefined) ??
      byCode.get(log.ticketCode.toLowerCase());
    if (!ticket) continue;

    let visits = firstVisits.get(ticket.id);
    if (!visits) {
      visits = new Map();
      firstVisits.set(ticket.id, visits);
    }
    // logs are sorted ascending, so the first one we see is the first visit
    if (!visits.has(log.checkpointId)) {
      visits.set(log.checkpointId, log.scannedAt);
    }
  }

  return tickets.map((ticket) => {
    const stamps = buildStamps(
      checkpoints,
      firstVisits.get(ticket.id) ?? new Map(),
    );
    const visitedCount = stamps.filter((s) => s.visited).length;
    return {
      ticketId: ticket.id,
      ticketCode: ticket.ticketCode,
      eventId: event.id,
      eventName: event.title,
      stamps,
      ...summarizeProgress(visitedCount, stamps.length),
    };
  });
}
