import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canViewTicket,
  computeProgressSummaryForCode,
  computeTicketProgress,
  summarizeProgress,
} from './ticket-progress.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('ticket-progress', () => {
  let prisma: any;

  const ticket = {
    id: 'tkt-1',
    ticketCode: 'CHK-2026-9812A',
    eventId: 'evt-1',
    userId: 'usr-attendee',
    email: 'juan@example.com',
    event: { title: 'Animo Expo', organizerId: 'usr-org' },
  };

  const booths = [
    { id: 'b1', name: 'Booth 1', location: 'A-1', type: 'BOOTH', parentId: null },
    { id: 'b2', name: 'Booth 2', location: 'A-2', type: 'BOOTH', parentId: null },
    { id: 'b2-sub', name: 'Booth 2 Demo', location: null, type: 'BOOTH', parentId: 'b2' },
    { id: 's1', name: 'Keynote', location: 'Hall', type: 'SESSION', parentId: null },
  ];

  beforeEach(() => {
    prisma = {
      ticket: { findFirst: vi.fn().mockResolvedValue(ticket) },
      checkpoint: { findMany: vi.fn().mockResolvedValue(booths) },
      attendanceLog: { findMany: vi.fn().mockResolvedValue([]) },
      eventOrganizer: { findFirst: vi.fn().mockResolvedValue(null) },
      eventStaff: { findFirst: vi.fn().mockResolvedValue(null) },
      checkpointStaff: { findFirst: vi.fn().mockResolvedValue(null) },
    };
  });

  describe('summarizeProgress', () => {
    it('computes percent and completion', () => {
      expect(summarizeProgress(3, 5)).toEqual({
        visitedCount: 3,
        totalCount: 5,
        percent: 60,
        completed: false,
      });
      expect(summarizeProgress(5, 5).completed).toBe(true);
    });

    it('treats an event with no booths as 0% and not completed', () => {
      expect(summarizeProgress(0, 0)).toEqual({
        visitedCount: 0,
        totalCount: 0,
        percent: 0,
        completed: false,
      });
    });
  });

  describe('computeTicketProgress', () => {
    it('only counts active booth/session checkpoints of the ticket event', async () => {
      await computeTicketProgress(prisma as PrismaService, ticket);

      const where = prisma.checkpoint.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        eventId: 'evt-1',
        isActive: true,
        deletedAt: null,
        type: { in: ['BOOTH', 'SESSION'] },
      });
      const logWhere = prisma.attendanceLog.findMany.mock.calls[0][0].where;
      expect(logWhere.scanResult).toBe('SUCCESS');
    });

    it('stamps visited booths once, keeping the first visit time', async () => {
      prisma.attendanceLog.findMany.mockResolvedValue([
        { checkpointId: 'b1', scannedAt: new Date('2026-11-20T01:00:00Z') },
        { checkpointId: 'b1', scannedAt: new Date('2026-11-20T02:00:00Z') },
        { checkpointId: 'b2-sub', scannedAt: new Date('2026-11-20T03:00:00Z') },
        // A gate scan that isn't in the stamp set must be ignored.
        { checkpointId: 'gate', scannedAt: new Date('2026-11-20T00:30:00Z') },
      ]);

      const result = await computeTicketProgress(prisma as PrismaService, ticket);

      expect(result.visitedCount).toBe(2);
      expect(result.totalCount).toBe(4);
      expect(result.percent).toBe(50);
      expect(result.completed).toBe(false);
      expect(result.eventName).toBe('Animo Expo');
      const b1 = result.stamps.find((s) => s.checkpointId === 'b1');
      expect(b1?.visited).toBe(true);
      expect(b1?.firstVisitedAt).toBe('2026-11-20T01:00:00.000Z');
      expect(result.stamps.find((s) => s.checkpointId === 'b2')?.visited).toBe(false);
    });

    it('marks the card completed when every booth is stamped', async () => {
      prisma.attendanceLog.findMany.mockResolvedValue(
        booths.map((b) => ({ checkpointId: b.id, scannedAt: new Date() })),
      );
      const result = await computeTicketProgress(prisma as PrismaService, ticket);
      expect(result.completed).toBe(true);
      expect(result.percent).toBe(100);
    });
  });

  describe('computeProgressSummaryForCode', () => {
    it('returns null for unknown tickets', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      expect(
        await computeProgressSummaryForCode(prisma as PrismaService, 'NOPE'),
      ).toBeNull();
    });

    it('returns a summary without the stamp list', async () => {
      prisma.attendanceLog.findMany.mockResolvedValue([
        { checkpointId: 'b1', scannedAt: new Date() },
      ]);
      const summary = await computeProgressSummaryForCode(
        prisma as PrismaService,
        '#CHK-2026-9812A',
      );
      expect(summary).toEqual({
        visitedCount: 1,
        totalCount: 4,
        percent: 25,
        completed: false,
      });
    });
  });

  describe('canViewTicket', () => {
    const user = (id: string, role = 'USER', email = `${id}@x.ph`) =>
      ({ id, role, email, fullName: id }) as any;

    it('allows the owner by user id or by email', async () => {
      expect(await canViewTicket(prisma, user('usr-attendee'), ticket)).toBe(true);
      expect(
        await canViewTicket(prisma, user('other', 'USER', 'JUAN@example.com'), ticket),
      ).toBe(true);
    });

    it('allows admins and the event organizer', async () => {
      expect(await canViewTicket(prisma, user('a', 'ADMIN'), ticket)).toBe(true);
      expect(await canViewTicket(prisma, user('usr-org'), ticket)).toBe(true);
    });

    it('allows event staff and co-organizers', async () => {
      prisma.eventStaff.findFirst.mockResolvedValue({ id: 'es-1' });
      expect(await canViewTicket(prisma, user('staffer'), ticket)).toBe(true);
    });

    it('denies unrelated users', async () => {
      expect(await canViewTicket(prisma, user('stranger'), ticket)).toBe(false);
    });
  });
});
