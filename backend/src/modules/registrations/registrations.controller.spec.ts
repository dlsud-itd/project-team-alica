import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegistrationsController } from './registrations.controller.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RegistrationsService } from './registrations.service.js';

describe('RegistrationsController', () => {
  let controller: RegistrationsController;
  let service: RegistrationsService;

  beforeEach(async () => {
    const mockService = {
      create: vi.fn().mockResolvedValue({
        ticketCode: 'CHK-2026-9812A',
        qrPayload: 'CHK-2026-9812A',
        attendeeName: 'Juan Dela Cruz',
        eventId: 'evt-1',
        status: 'REGISTERED',
      }),
      findByTicketCode: vi.fn().mockResolvedValue({
        id: 'tkt-1',
        ticketCode: 'CHK-2026-9812A',
        fullName: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan@example.com',
        phoneNumber: '',
        role: 'ATTENDEE',
        status: 'ACTIVE',
        issuedAt: new Date().toISOString(),
        qrPayload: 'CHK-2026-9812A',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistrationsController],
      providers: [
        {
          provide: RegistrationsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RegistrationsController>(RegistrationsController);
    service = module.get<RegistrationsService>(RegistrationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a registration', async () => {
    const res = await controller.register({
      eventId: 'evt-1',
      fullName: 'Juan Dela Cruz',
      email: 'juan@example.com',
      studentId: '2023-01982-MN-0',
    });
    expect(res.success).toBe(true);
    expect(res.data.ticketCode).toBe('CHK-2026-9812A');
  });

  it('should retrieve a registration by ticket code', async () => {
    const res = await controller.getByTicketCode('CHK-2026-9812A');
    expect(res.success).toBe(true);
    expect(res.data.ticketCode).toBe('CHK-2026-9812A');
    expect(res.data.fullName).toBe('Juan Dela Cruz');
  });
});

