import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { RegistrationsService } from './registrations.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    ticket: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const mockUser: UserSummaryDto = {
    id: 'usr-1',
    email: 'user@example.com',
    fullName: 'Jane Doe',
    role: 'ATTENDEE',
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn() },
      ticket: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
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
});
