import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, TicketStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service.js';
import { TICKET_CODE_PATTERN } from '../../common/ticket-code.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    ticket: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    checkpoint: { findMany: ReturnType<typeof vi.fn> };
    attendanceLog: { findMany: ReturnType<typeof vi.fn> };
    eventOrganizer: { findFirst: ReturnType<typeof vi.fn> };
    eventStaff: { findFirst: ReturnType<typeof vi.fn> };
    checkpointStaff: { findFirst: ReturnType<typeof vi.fn> };
  };

  const mockUser: UserSummaryDto = {
    id: 'usr-1',
    email: 'user@example.com',
    fullName: 'Jane Doe',
    role: 'ATTENDEE',
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn(), findFirst: vi.fn() },
      ticket: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      checkpoint: { findMany: vi.fn().mockResolvedValue([]) },
      attendanceLog: { findMany: vi.fn().mockResolvedValue([]) },
      eventOrganizer: { findFirst: vi.fn().mockResolvedValue(null) },
      eventStaff: { findFirst: vi.fn().mockResolvedValue(null) },
      checkpointStaff: { findFirst: vi.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<RegistrationsService>(RegistrationsService);
  });

  it('should reject registration if event is at full capacity', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
      capacity: 50,
    });
    prisma.ticket.findUnique.mockResolvedValue(null);
    prisma.ticket.count.mockResolvedValue(50);

    await expect(
      service.create({
        eventId: 'evt-1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        studentId: '2023-0001',
      }),
    ).rejects.toThrow(
      new BadRequestException('This event has reached full capacity'),
    );
  });

  it('should successfully create ticket if within capacity', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
      capacity: 50,
    });
    prisma.ticket.findUnique.mockResolvedValue(null);
    prisma.ticket.count.mockResolvedValue(20);
    prisma.ticket.create.mockResolvedValue({
      ticketCode: 'CHK-2026-1234A',
      qrPayload: 'CHK-2026-1234A',
      firstName: 'Jane',
      lastName: 'Doe',
      eventId: 'evt-1',
      status: 'REGISTERED',
    });

    const res = await service.create({
      eventId: 'evt-1',
      fullName: 'Jane Doe',
      email: 'jane@example.com',
      studentId: '2023-0001',
    });

    expect(res.ticketCode).toBe('CHK-2026-1234A');
    expect(res.attendeeName).toBe('Jane Doe');
  });

  it('should generate a short ticket code and use it as the QR payload', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
      capacity: null,
    });
    prisma.ticket.findUnique.mockResolvedValue(null);
    prisma.ticket.create.mockImplementation(({ data }) =>
      Promise.resolve({ ...data, status: 'REGISTERED' }),
    );

    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      await service.create({
        eventId: 'evt-1',
        fullName: 'Jane Doe',
        email: `jane${i}@example.com`,
        studentId: '2023-0001',
      });
      const { data } = prisma.ticket.create.mock.calls[i][0];
      expect(data.ticketCode).toMatch(TICKET_CODE_PATTERN);
      expect(data.qrPayload).toBe(data.ticketCode);
      codes.add(data.ticketCode);
    }
    expect(codes.size).toBe(50);
  });

  describe('ticket code collisions', () => {
    const collision = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['ticketCode'] },
      });
    const register = () =>
      service.create({
        eventId: 'evt-1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        studentId: '2023-0001',
      });

    beforeEach(() => {
      prisma.event.findUnique.mockResolvedValue({
        id: 'evt-1',
        isActive: true,
        deletedAt: null,
        approvalStatus: 'APPROVED',
        capacity: null,
      });
      prisma.ticket.findUnique.mockResolvedValue(null);
    });

    it('retries with a fresh code when the code is already taken', async () => {
      prisma.ticket.create
        .mockRejectedValueOnce(collision())
        .mockImplementationOnce(({ data }) =>
          Promise.resolve({ ...data, status: 'REGISTERED' }),
        );

      const res = await register();

      expect(prisma.ticket.create).toHaveBeenCalledTimes(2);
      const [first, second] = prisma.ticket.create.mock.calls.map(
        ([arg]) => arg.data.ticketCode,
      );
      expect(second).not.toBe(first);
      expect(res.ticketCode).toBe(second);
    });

    it('gives up after 5 colliding attempts', async () => {
      prisma.ticket.create.mockRejectedValue(collision());
      await expect(register()).rejects.toThrow('Unique constraint failed');
      expect(prisma.ticket.create).toHaveBeenCalledTimes(5);
    });

    it('does not retry other unique-constraint errors', async () => {
      prisma.ticket.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['eventId', 'email'] },
        }),
      );
      await expect(register()).rejects.toThrow();
      expect(prisma.ticket.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('findForUser', () => {
    it('returns no QR payload when the user has no tickets', async () => {
      prisma.ticket.findFirst.mockResolvedValue(null);
      const res = await service.findForUser(mockUser);
      expect(res.ticketCode).toBe('');
      expect(res.qrPayload).toBe('');
    });
  });

  describe('findByTicketCode', () => {
    const ticket = {
      id: 'tkt-1',
      ticketCode: 'CHK-ABC',
      qrPayload: 'CHK-ABC',
      eventId: 'evt-1',
      userId: 'owner-1',
      email: 'owner@example.com',
      firstName: 'Olive',
      lastName: 'Owner',
      studentId: '2023-0001',
      createdAt: new Date('2026-11-01T00:00:00Z'),
      event: { title: 'Tech Summit', organizerId: 'org-1' },
    };
    const stranger: UserSummaryDto = {
      id: 'stranger-1',
      email: 'stranger@example.com',
      fullName: 'Sam Stranger',
      role: 'ATTENDEE',
    };

    beforeEach(() => {
      prisma.ticket.findUnique.mockResolvedValue(ticket);
    });

    it('returns the ticket to its owner', async () => {
      const res = await service.findByTicketCode(
        { ...stranger, id: 'owner-1', email: 'owner@example.com' },
        'CHK-ABC',
      );
      expect(res.ticketCode).toBe('CHK-ABC');
      expect(res.qrPayload).toBe('CHK-ABC');
      expect(res.eventName).toBe('Tech Summit');
    });

    it('matches the owner by email case-insensitively', async () => {
      const res = await service.findByTicketCode(
        { ...stranger, email: 'OWNER@example.com' },
        'CHK-ABC',
      );
      expect(res.email).toBe('owner@example.com');
    });

    it('allows admins and the event organizer', async () => {
      await expect(
        service.findByTicketCode({ ...stranger, role: 'ADMIN' }, 'CHK-ABC'),
      ).resolves.toBeDefined();
      await expect(
        service.findByTicketCode({ ...stranger, id: 'org-1' }, 'CHK-ABC'),
      ).resolves.toBeDefined();
    });

    it.each(['eventOrganizer', 'eventStaff', 'checkpointStaff'] as const)(
      'allows a user found in %s for the event',
      async (table) => {
        prisma[table].findFirst.mockResolvedValue({ id: 'row-1' });
        await expect(
          service.findByTicketCode(stranger, 'CHK-ABC'),
        ).resolves.toBeDefined();
      },
    );

    it('rejects anyone else with ForbiddenException', async () => {
      await expect(
        service.findByTicketCode(stranger, 'CHK-ABC'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.eventStaff.findFirst).toHaveBeenCalledWith({
        where: { eventId: 'evt-1', userId: 'stranger-1', isActive: true },
        select: { id: true },
      });
    });

    it('throws NotFoundException for an unknown code', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(
        service.findByTicketCode(stranger, 'CHK-NOPE'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('should reject registration if email is already registered', async () => {
    prisma.event.findUnique.mockResolvedValue({
      id: 'evt-1',
      isActive: true,
      deletedAt: null,
      approvalStatus: 'APPROVED',
      capacity: 50,
    });
    prisma.ticket.findUnique.mockResolvedValue({ id: 'tkt-existing' });

    await expect(
      service.create({
        eventId: 'evt-1',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        studentId: '2023-0001',
      }),
    ).rejects.toThrow(
      new ConflictException('This email is already registered for this event'),
    );
  });

  describe('findMine', () => {
    it('returns formatted RSVP list matching user id or email', async () => {
      prisma.ticket.findMany.mockResolvedValue([
        {
          id: 'tkt-1',
          ticketCode: 'CHK-2026-1111A',
          qrPayload: 'CHK-2026-1111A',
          ticketType: 'STUDENT',
          status: TicketStatus.REGISTERED,
          createdAt: new Date('2026-10-31T10:00:00Z'),
          firstScannedAt: null,
          event: {
            id: 'evt-1',
            title: 'Campus Hackathon 2026',
            slug: 'campus-hackathon-2026',
            venueName: 'Lab 3',
            startDate: new Date('2026-11-20T08:00:00Z'),
            endDate: new Date('2026-11-20T17:00:00Z'),
            description: 'Annual hackathon',
          },
        },
      ]);

      const res = await service.findMine(mockUser);
      expect(res).toHaveLength(1);
      expect(res[0].ticketCode).toBe('CHK-2026-1111A');
      expect(res[0].status).toBe('Registered');
      expect(res[0].category).toBe('HACKATHON');
      expect(res[0].categoryLabel).toBe('Hackathon');
      expect(res[0].eventName).toBe('Campus Hackathon 2026');
    });
  });

  describe('cancelRsvp', () => {
    it('cancels ticket when requested by owner', async () => {
      const existingTicket = {
        id: 'tkt-1',
        ticketCode: 'CHK-2026-1111A',
        userId: 'usr-1',
        email: 'user@example.com',
        status: TicketStatus.REGISTERED,
        event: {
          id: 'evt-1',
          title: 'Campus Hackathon 2026',
          slug: 'campus-hackathon-2026',
          venueName: 'Lab 3',
          startDate: new Date('2026-11-20T08:00:00Z'),
          endDate: new Date('2026-11-20T17:00:00Z'),
          description: '',
        },
      };

      prisma.ticket.findUnique.mockResolvedValue(existingTicket);
      prisma.ticket.update.mockResolvedValue({
        ...existingTicket,
        status: TicketStatus.CANCELLED,
        createdAt: new Date(),
        firstScannedAt: null,
        ticketType: 'STUDENT',
        qrPayload: 'CHK-2026-1111A',
      });

      const res = await service.cancelRsvp(mockUser, 'CHK-2026-1111A');
      expect(res.status).toBe('Cancelled');
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 'tkt-1' },
        data: { status: TicketStatus.CANCELLED },
        include: { event: true },
      });
    });

    it('rejects cancellation if user does not own the ticket', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt-2',
        ticketCode: 'CHK-2026-2222B',
        userId: 'other-user',
        email: 'other@example.com',
        status: TicketStatus.REGISTERED,
        event: { id: 'evt-1' },
      });

      await expect(
        service.cancelRsvp(mockUser, 'CHK-2026-2222B'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects cancellation if ticket is already cancelled', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'tkt-1',
        ticketCode: 'CHK-2026-1111A',
        userId: 'usr-1',
        email: 'user@example.com',
        status: TicketStatus.CANCELLED,
        event: { id: 'evt-1' },
      });

      await expect(
        service.cancelRsvp(mockUser, 'CHK-2026-1111A'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if ticket does not exist', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelRsvp(mockUser, 'CHK-NONEXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getMyProgressForEvent', () => {
    it('throws NotFoundException if event does not exist', async () => {
      prisma.event.findFirst.mockResolvedValue(null);

      await expect(
        service.getMyProgressForEvent(mockUser, 'evt-unknown'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns null if user has no ticket for the event', async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        title: 'Tech Summit',
        organizerId: 'usr-org',
      });
      prisma.ticket.findFirst.mockResolvedValue(null);

      const result = await service.getMyProgressForEvent(mockUser, 'evt-1');
      expect(result).toBeNull();
    });

    it('returns computed progress when user has an active ticket', async () => {
      prisma.event.findFirst.mockResolvedValue({
        id: 'evt-1',
        title: 'Tech Summit',
        organizerId: 'usr-org',
      });
      prisma.ticket.findFirst.mockResolvedValue({
        id: 'tkt-1',
        ticketCode: 'CHK-2026-9812A',
        eventId: 'evt-1',
        userId: mockUser.id,
        email: mockUser.email,
        event: { title: 'Tech Summit', organizerId: 'usr-org' },
      });
      prisma.checkpoint.findMany.mockResolvedValue([
        {
          id: 'chk-1',
          name: 'Booth 1',
          location: 'Hall A',
          type: 'BOOTH',
          parentId: null,
        },
      ]);
      prisma.attendanceLog.findMany.mockResolvedValue([
        {
          checkpointId: 'chk-1',
          scannedAt: new Date(),
        },
      ]);

      const result = await service.getMyProgressForEvent(mockUser, 'evt-1');
      expect(result).not.toBeNull();
      expect(result?.ticketCode).toBe('CHK-2026-9812A');
      expect(result?.visitedCount).toBe(1);
      expect(result?.totalCount).toBe(1);
      expect(result?.percent).toBe(100);
      expect(result?.completed).toBe(true);
    });
  });
});
