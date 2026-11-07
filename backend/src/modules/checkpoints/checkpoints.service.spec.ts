import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { CheckpointsService } from './checkpoints.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TicketStatus } from '@prisma/client';

describe('CheckpointsService', () => {
  let service: CheckpointsService;
  let mockPrisma: any;

  const mockUser = {
    id: 'usr-staff-1',
    email: 'staff@alica.ph',
    fullName: 'Station Staff',
    role: 'STAFF' as const,
  };

  const mockBooth = {
    id: 'chk-booth-1',
    name: 'Partner Booth: AWS Cloud Station',
    location: 'Exhibition Hall Booth A-12',
    type: 'BOOTH' as const,
    allowMultipleScans: true,
    requireMainEntry: false,
    isActive: true,
    deletedAt: null,
    eventId: 'evt-devcon-1',
    event: { title: 'DevCon Manila 2026' },
  };

  const mockMainGate = {
    id: 'chk-gate-1',
    name: 'Main Entrance Gate A',
    location: 'North Wing',
    type: 'MAIN_ENTRY' as const,
    allowMultipleScans: false,
    requireMainEntry: false,
    isActive: true,
    deletedAt: null,
    eventId: 'evt-devcon-1',
    event: { title: 'DevCon Manila 2026' },
  };

  const mockSession = {
    id: 'chk-session-1',
    name: 'Plenary Session',
    location: 'Room 1',
    type: 'SESSION' as const,
    allowMultipleScans: false,
    requireMainEntry: true,
    isActive: true,
    deletedAt: null,
    eventId: 'evt-devcon-1',
    event: { title: 'DevCon Manila 2026' },
  };

  const mockTicket = {
    id: 'tkt-1',
    eventId: 'evt-devcon-1',
    ticketCode: 'CHK-2026-9812A',
    firstName: 'Alen Mikel',
    lastName: 'Umandal',
    studentId: '2023-01982-MN-0',
    ticketType: 'STUDENT',
    status: TicketStatus.REGISTERED,
    firstScannedAt: null,
    lastScannedAt: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      checkpoint: {
        findMany: vi.fn().mockResolvedValue([mockBooth]),
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === 'chk-booth-1') return Promise.resolve(mockBooth);
          if (where.id === 'chk-gate-1') return Promise.resolve(mockMainGate);
          if (where.id === 'chk-session-1') return Promise.resolve(mockSession);
          return Promise.resolve(null);
        }),
      },
      checkpointStaff: {
        findMany: vi.fn().mockResolvedValue([{ checkpointId: 'chk-booth-1' }]),
      },
      eventStaff: {
        findMany: vi.fn().mockResolvedValue([{ eventId: 'evt-devcon-1' }]),
      },
      ticket: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          const codes = where.OR.map((o: any) => o.ticketCode.equals?.toUpperCase());
          if (codes.includes('CHK-2026-9812A')) return Promise.resolve(mockTicket);
          if (codes.includes('CANCELLED-01')) {
            return Promise.resolve({ ...mockTicket, ticketCode: 'CANCELLED-01', status: TicketStatus.CANCELLED });
          }
          return Promise.resolve(null);
        }),
        update: vi.fn().mockResolvedValue(mockTicket),
      },
      attendanceLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckpointsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<CheckpointsService>(CheckpointsService);
  });

  it('should find my checkpoints', async () => {
    const list = await service.findMyCheckpoints(mockUser);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('chk-booth-1');
    expect(list[0].type).toBe('BOOTH');
  });

  it('should allow valid booth scan with multiple scans permitted', async () => {
    const result = await service.scan(mockUser, 'chk-booth-1', {
      ticketCode: 'CHK-2026-9812A',
      deviceInfo: 'Booth Scanner iPad',
    });

    expect(result.scanResult).toBe('SUCCESS');
    expect(result.checkpoint.type).toBe('BOOTH');
    expect(result.attendee?.fullName).toBe('Alen Mikel Umandal');
    expect(mockPrisma.attendanceLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scanResult: 'SUCCESS',
          checkpointId: 'chk-booth-1',
        }),
      }),
    );
  });

  it('should throw 409 Conflict when single-scan checkpoint is scanned twice', async () => {
    mockPrisma.attendanceLog.findFirst = vi.fn().mockResolvedValueOnce({
      id: 'prior-log',
      scannedAt: new Date('2026-11-15T08:00:00Z'),
    });

    await expect(
      service.scan(mockUser, 'chk-gate-1', { ticketCode: 'CHK-2026-9812A' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw 404 NotFound when ticket is not found', async () => {
    await expect(
      service.scan(mockUser, 'chk-booth-1', { ticketCode: 'NOT-EXIST' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw 400 BadRequest when ticket is cancelled', async () => {
    await expect(
      service.scan(mockUser, 'chk-booth-1', { ticketCode: 'CANCELLED-01' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return WARNING_NO_MAIN_ENTRY when session checkpoint requires main entry first', async () => {
    // mainEntryScan returns null
    mockPrisma.attendanceLog.findFirst = vi.fn().mockResolvedValue(null);

    const result = await service.scan(mockUser, 'chk-session-1', {
      ticketCode: 'CHK-2026-9812A',
    });

    expect(result.scanResult).toBe('WARNING_NO_MAIN_ENTRY');
    expect(result.message).toContain('main entrance');
  });
});

