import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

  const mockOrganizer = {
    id: 'usr-org',
    email: 'organizer@alica.ph',
    fullName: 'Campus Organizer',
    role: 'USER' as const,
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
    parentId: null,
    event: { title: 'DevCon Manila 2026', organizerId: 'usr-org' },
  };

  const mockSubBooth = {
    ...mockBooth,
    id: 'chk-sub-existing',
    name: 'AWS Demo Station 1',
    parentId: 'chk-booth-1',
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
    parentId: null,
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
    parentId: null,
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
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'chk-sub-new',
            isActive: true,
            deletedAt: null,
            ...data,
            event: { title: 'DevCon Manila 2026' },
          }),
        ),
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === 'chk-booth-1') return Promise.resolve(mockBooth);
          if (where.id === 'chk-sub-existing')
            return Promise.resolve(mockSubBooth);
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
          const codes = (where.OR || [])
            .map((o: any) => {
              const val =
                o.ticketCode?.equals ??
                o.qrPayload?.equals ??
                o.id?.equals ??
                o.id;
              return typeof val === 'string' ? val.toUpperCase() : undefined;
            })
            .filter(Boolean);
          if (codes.includes('CHK-2026-9812A'))
            return Promise.resolve(mockTicket);
          if (codes.includes('CANCELLED-01')) {
            return Promise.resolve({
              ...mockTicket,
              ticketCode: 'CANCELLED-01',
              status: TicketStatus.CANCELLED,
            });
          }
          return Promise.resolve(null);
        }),
        update: vi.fn().mockResolvedValue(mockTicket),
      },
      attendanceLog: {
        create: vi.fn().mockResolvedValue({ id: 'log-1' }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(4),
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
    expect(list[0].parentId).toBeNull();
  });

  it('should return empty list when user has no staff assignments', async () => {
    mockPrisma.checkpointStaff.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.eventStaff.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.checkpoint.findMany = vi.fn().mockResolvedValue([]);

    const list = await service.findMyCheckpoints({
      id: 'usr-attendee-alen',
      email: 'amc.umandal@gmail.com',
      fullName: 'Alen Mikel Umandal',
      role: 'USER',
    });

    expect(list).toEqual([]);
    expect(mockPrisma.checkpoint.findMany).not.toHaveBeenCalled();
  });

  it('should include owned event checkpoints in findAccessibleCheckpoints for USER organizer', async () => {
    mockPrisma.checkpointStaff.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.eventStaff.findMany = vi.fn().mockResolvedValue([]);
    mockPrisma.checkpoint.findMany = vi
      .fn()
      .mockResolvedValue([mockBooth, mockSubBooth]);

    const list = await service.findAccessibleCheckpoints(mockOrganizer);

    expect(list.length).toBe(2);
    expect(list[1].parentId).toBe('chk-booth-1');
    expect(mockPrisma.checkpoint.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { event: { organizerId: 'usr-org', deletedAt: null } },
          ]),
        }),
      }),
    );
  });

  it('should return all active checkpoints for admin user', async () => {
    mockPrisma.checkpoint.findMany = vi
      .fn()
      .mockResolvedValue([mockBooth, mockMainGate]);

    const list = await service.findMyCheckpoints({
      id: 'usr-admin-1',
      email: 'admin@dlsud.edu.ph',
      fullName: 'Admin',
      role: 'ADMIN',
    });

    expect(list.length).toBe(2);
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

  describe('createSubBooth', () => {
    it('should create a sub-booth under a booth for a dynamic USER event organizer', async () => {
      const result = await service.createSubBooth(
        mockOrganizer,
        'chk-booth-1',
        {
          name: 'Demo Station 1',
        },
      );

      expect(result.parentId).toBe('chk-booth-1');
      expect(result.type).toBe('BOOTH');
      expect(result.eventId).toBe('evt-devcon-1');
      expect(result.name).toBe('Demo Station 1');
      expect(mockPrisma.checkpoint.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            parentId: 'chk-booth-1',
            eventId: 'evt-devcon-1',
            type: 'BOOTH',
          }),
        }),
      );
    });

    it('should inherit the parent location when none is given', async () => {
      const result = await service.createSubBooth(
        mockOrganizer,
        'chk-booth-1',
        {
          name: 'Demo Station 1',
        },
      );
      expect(result.location).toBe('Exhibition Hall Booth A-12');
    });

    it('should reject non-organizer users who do not own the event', async () => {
      await expect(
        service.createSubBooth(
          {
            id: 'usr-other',
            email: 'other@alica.ph',
            fullName: 'Other',
            role: 'USER',
          },
          'chk-booth-1',
          { name: 'Demo Station 1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw 404 when the parent booth is not found', async () => {
      await expect(
        service.createSubBooth(mockOrganizer, 'nope', {
          name: 'Demo Station 1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 when the parent is already a sub-booth', async () => {
      await expect(
        service.createSubBooth(mockOrganizer, 'chk-sub-existing', {
          name: 'Nested',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 when the name is empty', async () => {
      await expect(
        service.createSubBooth(mockOrganizer, 'chk-booth-1', { name: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('boothId routing and cooldown rules', () => {
    it('returns station details with sub-booths and cooldownSeconds for findStationById', async () => {
      mockPrisma.checkpoint.findMany = vi
        .fn()
        .mockResolvedValue([mockSubBooth]);

      const details = await service.findStationById(mockUser, 'chk-booth-1');
      expect(details.id).toBe('chk-booth-1');
      expect(details.cooldownSeconds).toBe(30);
      expect(details.totalScans).toBe(4);
      expect(details.subBooths).toHaveLength(1);
      expect(details.subBooths[0].id).toBe('chk-sub-existing');
    });

    it('blocks unassigned users from accessing or scanning a station', async () => {
      mockPrisma.checkpointStaff.findMany = vi.fn().mockResolvedValue([]);
      mockPrisma.eventStaff.findMany = vi.fn().mockResolvedValue([]);

      const outsider = {
        id: 'usr-outsider',
        email: 'outsider@alica.ph',
        fullName: 'Outsider',
        role: 'USER' as const,
      };

      await expect(
        service.findStationById(outsider, 'chk-booth-1'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.scan(outsider, 'chk-booth-1', { ticketCode: 'CHK-2026-9812A' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('enforces cooldown window on multi-scan booths', async () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);
      mockPrisma.attendanceLog.findFirst = vi.fn().mockResolvedValueOnce({
        id: 'recent-booth-scan',
        scannedAt: fiveSecondsAgo,
      });

      await expect(
        service.scan(mockUser, 'chk-booth-1', {
          ticketCode: 'CHK-2026-9812A',
          cooldownSeconds: 30,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows multi-scan booth entry once cooldown has elapsed', async () => {
      const fortySecondsAgo = new Date(Date.now() - 40_000);
      mockPrisma.attendanceLog.findFirst = vi.fn().mockResolvedValueOnce({
        id: 'older-booth-scan',
        scannedAt: fortySecondsAgo,
      });

      const outcome = await service.scan(mockUser, 'chk-booth-1', {
        ticketCode: 'CHK-2026-9812A',
        cooldownSeconds: 30,
      });
      expect(outcome.scanResult).toBe('SUCCESS');
    });
  });
});
