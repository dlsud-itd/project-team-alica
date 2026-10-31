import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('RegistrationsService', () => {
  let service: RegistrationsService;
  let prisma: {
    event: { findUnique: ReturnType<typeof vi.fn> };
    ticket: {
      findUnique: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(async () => {
    prisma = {
      event: { findUnique: vi.fn() },
      ticket: {
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
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
    ).rejects.toThrow(new BadRequestException('This event has reached full capacity'));
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
});

