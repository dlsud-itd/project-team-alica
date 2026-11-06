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

  it('should get attendee history', async () => {
    const result = await controller.getAttendeeHistory('CHK-2026-9812A');
    expect(result.success).toBe(true);
    expect(result.data.ticketCode).toBe('CHK-2026-9812A');
  });
});

