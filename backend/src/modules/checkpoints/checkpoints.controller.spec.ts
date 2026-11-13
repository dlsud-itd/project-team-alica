import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CheckpointsController } from './checkpoints.controller.js';
import { CheckpointsService } from './checkpoints.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';

describe('CheckpointsController', () => {
  let controller: CheckpointsController;
  let mockService: Record<string, ReturnType<typeof vi.fn>>;

  const mockUser = {
    id: 'usr-staff-1',
    email: 'staff@alica.ph',
    fullName: 'Station Staff',
    role: 'STAFF' as const,
  };

  beforeEach(async () => {
    mockService = {
      findMyCheckpoints: vi.fn().mockResolvedValue([
        {
          id: 'chk-booth-1',
          name: 'Partner Booth: AWS Cloud Station',
          location: 'Exhibition Hall Booth A-12',
          type: 'BOOTH',
          allowMultipleScans: true,
          requireMainEntry: false,
          eventId: 'evt-devcon-1',
          eventName: 'DevCon Manila 2026',
        },
      ]),
      scan: vi.fn().mockResolvedValue({
        scanResult: 'SUCCESS',
        message: 'Check-in successful',
        scannedAt: '2026-11-15T08:14:22.000Z',
        firstScannedAt: null,
        checkpoint: {
          id: 'chk-booth-1',
          name: 'Partner Booth: AWS Cloud Station',
          type: 'BOOTH',
        },
        attendee: {
          fullName: 'Alen Mikel Umandal',
          studentId: '2023-01982-MN-0',
          ticketType: 'STUDENT',
          ticketCode: 'CHK-2026-9812A',
        },
      }),
      findAccessibleCheckpoints: vi.fn().mockResolvedValue([
        {
          id: 'chk-booth-1',
          name: 'Partner Booth: AWS Cloud Station',
          location: 'Exhibition Hall Booth A-12',
          type: 'BOOTH',
          allowMultipleScans: true,
          requireMainEntry: false,
          cooldownSeconds: 30,
          eventId: 'evt-devcon-1',
          eventName: 'DevCon Manila 2026',
          parentId: null,
        },
      ]),
      findStationById: vi.fn().mockResolvedValue({
        id: 'chk-booth-1',
        name: 'Partner Booth: AWS Cloud Station',
        location: 'Exhibition Hall Booth A-12',
        type: 'BOOTH',
        allowMultipleScans: true,
        requireMainEntry: false,
        cooldownSeconds: 30,
        eventId: 'evt-devcon-1',
        eventName: 'DevCon Manila 2026',
        parentId: null,
        subBooths: [],
        totalScans: 12,
      }),
      createSubBooth: vi.fn().mockResolvedValue({
        id: 'chk-sub-1',
        name: 'Demo Station 1',
        location: 'Exhibition Hall Booth A-12',
        type: 'BOOTH',
        allowMultipleScans: true,
        requireMainEntry: false,
        eventId: 'evt-devcon-1',
        eventName: 'DevCon Manila 2026',
        parentId: 'chk-booth-1',
      }),
      getAttendeeHistory: vi.fn().mockResolvedValue({
        ticketCode: 'CHK-2026-9812A',
        scans: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckpointsController],
      providers: [
        {
          provide: CheckpointsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CheckpointsController>(CheckpointsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return my checkpoints', async () => {
    const result = await controller.getMyCheckpoints(mockUser);
    expect(result.success).toBe(true);
    expect(result.data.length).toBe(1);
    expect(result.data[0].type).toBe('BOOTH');
    expect(result.data[0].allowMultipleScans).toBe(true);
  });

  it('should process a valid booth scan', async () => {
    const result = await controller.scanTicket(mockUser, 'chk-booth-1', {
      ticketCode: 'CHK-2026-9812A',
    });
    expect(result.success).toBe(true);
    expect(result.data.scanResult).toBe('SUCCESS');
    expect(result.data.checkpoint.type).toBe('BOOTH');
  });

  it('should create a sub-booth using dynamic user context', async () => {
    const organizerUser = {
      id: 'usr-org-1',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'USER' as const,
    };
    const result = await controller.createSubBooth(
      organizerUser,
      'chk-booth-1',
      {
        name: 'Demo Station 1',
      },
    );
    expect(result.success).toBe(true);
    expect(result.data.parentId).toBe('chk-booth-1');
    expect(mockService.createSubBooth).toHaveBeenCalledWith(
      organizerUser,
      'chk-booth-1',
      { name: 'Demo Station 1' },
    );
  });

  it('should get station details by boothId', async () => {
    const result = await controller.getStation(mockUser, 'chk-booth-1');
    expect(result.success).toBe(true);
    expect(result.data.id).toBe('chk-booth-1');
    expect(result.data.cooldownSeconds).toBe(30);
    expect(result.data.totalScans).toBe(12);
  });

  it('should get attendee history', async () => {
    const result = await controller.getAttendeeHistory('CHK-2026-9812A');
    expect(result.success).toBe(true);
    expect(result.data.ticketCode).toBe('CHK-2026-9812A');
  });
});
