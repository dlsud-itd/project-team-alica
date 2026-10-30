import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { AuthService } from '../auth/auth.service.js';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;
  let authService: AuthService;

  beforeEach(async () => {
    const mockEventsService = {
      findAll: vi.fn().mockResolvedValue([
        {
          id: 'evt-1',
          slug: 'test-event',
          title: 'Test Event',
          description: 'A test event',
          category: 'CONFERENCE',
          categoryLabel: 'Conference',
          dateLabel: 'Nov 15, 2026',
          timeLabel: '8:00 AM - 5:00 PM',
          venue: 'Main Gym',
          spotsTotal: 100,
          spotsTaken: 10,
          status: 'OPEN',
          statusLabel: 'Registration Open',
          organizerName: 'Test Org',
          organizerId: 'usr-org',
          staffIds: [],
          registeredUserIds: [],
        },
      ]),
      findForOrganizer: vi.fn().mockResolvedValue({
        events: [],
        registrants: [],
      }),
    };
    const mockAuthService = {
      getMe: vi.fn().mockResolvedValue({
        id: 'organizer-1',
        role: 'ORGANIZER',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return wrapped list of events', async () => {
    const res = await controller.getEvents();
    expect(res.success).toBe(true);
    expect(res.data.length).toBe(1);
    expect(res.data[0].id).toBe('evt-1');
  });

  it('should return events for the authenticated organizer', async () => {
    const res = await controller.getOrganizerEvents('Bearer valid-token');

    expect(res).toEqual({ success: true, data: { events: [], registrants: [] } });
    expect(service.findForOrganizer).toHaveBeenCalledWith('organizer-1');
  });

  it('should reject organizer data requests without an authorization header', async () => {
    await expect(controller.getOrganizerEvents()).rejects.toThrow(UnauthorizedException);
  });

  it('should reject organizer data requests from non-organizers', async () => {
    vi.spyOn(authService, 'getMe').mockResolvedValue({
      id: 'attendee-1',
      role: 'ATTENDEE',
      email: 'attendee@example.com',
      fullName: 'Attendee',
    });

    await expect(controller.getOrganizerEvents('Bearer valid-token')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
