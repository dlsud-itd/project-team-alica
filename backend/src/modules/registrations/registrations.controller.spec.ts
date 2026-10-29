import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RegistrationsController } from './registrations.controller.js';
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
      findByEventId: vi.fn().mockResolvedValue([
        {
          id: 'tkt-1',
          event_id: 'evt-1',
          attendee_id: 'usr-1',
          full_name: 'Juan Dela Cruz',
          email: 'juan@example.com',
          ticket_id: 'CHK-2026-9812A',
          registered_at: '2026-10-12T10:15:00.000Z',
          status: 'Registered',
        },
      ]),
      toggleCheckIn: vi.fn().mockResolvedValue({
        id: 'tkt-1',
        event_id: 'evt-1',
        attendee_id: 'usr-1',
        full_name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        ticket_id: 'CHK-2026-9812A',
        registered_at: '2026-10-12T10:15:00.000Z',
        status: 'Checked In',
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
    }).compile();

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

  it('should retrieve registrants by event ID', async () => {
    const res = await controller.getByEventId('evt-1');
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(1);
    expect(res.data[0].full_name).toBe('Juan Dela Cruz');
    expect(service.findByEventId).toHaveBeenCalledWith('evt-1');
  });

  it('should toggle check-in status of a ticket', async () => {
    const res = await controller.toggleCheckIn('tkt-1');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('Checked In');
    expect(service.toggleCheckIn).toHaveBeenCalledWith('tkt-1');
  });
});
