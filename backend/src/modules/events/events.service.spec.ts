import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventApprovalStatus, TicketStatus } from '@prisma/client';
import { EventsService } from './events.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

const ORGANIZER: UserSummaryDto = {
  id: 'usr-org',
  email: 'organizer@alica.ph',
  fullName: 'Campus Organizer',
  role: 'ORGANIZER',
};

const ADMIN: UserSummaryDto = {
  id: 'usr-admin',
  email: 'admin@dlsud.edu.ph',
  fullName: 'System Administrator',
  role: 'ADMIN',
};

const futureIso = (daysAhead: number, hour: number) => {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
};

const dbEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  title: 'Tech Summit',
  slug: 'tech-summit',
  description: null,
  venueName: 'Gymnasium',
  startDate: new Date(futureIso(10, 9)),
  endDate: new Date(futureIso(10, 17)),
  capacity: 100,
  allowWalkIns: false,
  isActive: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  approvalStatus: EventApprovalStatus.PENDING,
  reviewNotes: null,
  reviewedAt: null,
  reviewedById: null,
  organizerId: 'usr-org',
  ...overrides,
});

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    event: Record<string, ReturnType<typeof vi.fn>>;
    ticket: Record<string, ReturnType<typeof vi.fn>>;
  };

  beforeEach(async () => {
    prisma = {
      event: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
      ticket: {
        count: vi.fn().mockResolvedValue(0),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EventsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  describe('create', () => {
    const dto = {
      name: 'AI Workshop',
      venue: 'Lab 1',
      starts_at: futureIso(5, 9),
      ends_at: futureIso(5, 12),
      capacity: 40,
    };

    it('submits the event as pending for the current organizer', async () => {
      prisma.event.create.mockImplementation(({ data }) =>
        Promise.resolve(dbEvent({ ...data, id: 'evt-new' })),
      );

      const res = await service.create(ORGANIZER, dto);

      const { data } = prisma.event.create.mock.calls[0][0];
      expect(data.approvalStatus).toBe(EventApprovalStatus.PENDING);
      expect(data.organizerId).toBe('usr-org');
      expect(data.slug).toBe('ai-workshop');
      expect(res.approval_status).toBe('Pending');
    });

    it('rejects attendees', async () => {
      await expect(
        service.create({ ...ORGANIZER, role: 'ATTENDEE' }, dto),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects events that start in the past', async () => {
      await expect(
        service.create(ORGANIZER, {
          ...dto,
          starts_at: '2020-01-01T09:00:00Z',
          ends_at: '2020-01-01T10:00:00Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid capacity', async () => {
      await expect(
        service.create(ORGANIZER, { ...dto, capacity: 0 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('review', () => {
    it('only lets admins review', async () => {
      await expect(
        service.review(ORGANIZER, 'evt-1', { decision: 'APPROVED' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a reason when rejecting', async () => {
      await expect(
        service.review(ADMIN, 'evt-1', { decision: 'REJECTED', notes: ' ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('records the decision and reviewer', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.event.update.mockImplementation(({ data }) =>
        Promise.resolve({
          ...dbEvent(data),
          organizer: { fullName: 'Campus Organizer', email: 'o@alica.ph' },
          _count: { tickets: 0 },
        }),
      );

      const res = await service.review(ADMIN, 'evt-1', {
        decision: 'APPROVED',
      });

      const { data } = prisma.event.update.mock.calls[0][0];
      expect(data.approvalStatus).toBe('APPROVED');
      expect(data.reviewedById).toBe('usr-admin');
      expect(res.approval_status).toBe('Approved');
      expect(res.organizer_name).toBe('Campus Organizer');
    });
  });

  it('resubmits a rejected event when the organizer edits it', async () => {
    prisma.event.findFirst.mockResolvedValue(
      dbEvent({ approvalStatus: EventApprovalStatus.REJECTED }),
    );
    prisma.event.update.mockImplementation(({ data }) =>
      Promise.resolve(dbEvent({ approvalStatus: data.approvalStatus })),
    );

    const res = await service.update(ORGANIZER, 'evt-1', { venue: 'Hall B' });

    const { data } = prisma.event.update.mock.calls[0][0];
    expect(data.approvalStatus).toBe(EventApprovalStatus.PENDING);
    expect(data.reviewNotes).toBeNull();
    expect(res.approval_status).toBe('Pending');
  });

  it('only lists approved events publicly', async () => {
    prisma.event.findMany.mockResolvedValue([]);
    await service.findAll();
    expect(prisma.event.findMany.mock.calls[0][0].where.approvalStatus).toBe(
      EventApprovalStatus.APPROVED,
    );
  });

  describe('cancelRegistrant and restoreRegistrant', () => {
    const mockTicket = {
      id: 'tkt-1',
      eventId: 'evt-1',
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      studentId: '2023-1234',
      ticketCode: 'CHK-2026-ALICE',
      status: TicketStatus.REGISTERED,
      createdAt: new Date(),
    };

    it('cancels registrant for an owned event', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue(mockTicket);
      prisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });

      const res = await service.cancelRegistrant(ORGANIZER, 'evt-1', 'tkt-1');
      expect(res.status).toBe('Cancelled');
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-1' },
        data: { status: TicketStatus.CANCELLED },
      });
    });

    it('rejects cancellation if registrant already cancelled', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });

      await expect(
        service.cancelRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('restores a cancelled registrant when capacity is available', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent({ capacity: 100 }));
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });
      prisma.ticket.count.mockResolvedValue(50);
      prisma.ticket.update.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.REGISTERED,
      });

      const res = await service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1');
      expect(res.status).toBe('Registered');
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-1' },
        data: { status: TicketStatus.REGISTERED },
      });
    });

    it('rejects restore if event is at capacity', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent({ capacity: 100 }));
      prisma.ticket.findFirst.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.CANCELLED,
      });
      prisma.ticket.count.mockResolvedValue(100);

      await expect(
        service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects restore if registrant is not cancelled', async () => {
      prisma.event.findFirst.mockResolvedValue(dbEvent());
      prisma.ticket.findFirst.mockResolvedValue(mockTicket);

      await expect(
        service.restoreRegistrant(ORGANIZER, 'evt-1', 'tkt-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
