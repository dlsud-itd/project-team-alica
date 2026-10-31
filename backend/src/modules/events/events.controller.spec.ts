import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsController } from './events.controller.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { EventsService } from './events.service.js';

describe('EventsController', () => {
  let controller: EventsController;
  let mockEventsService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    mockEventsService = {
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
      findForOrganizer: vi.fn().mockResolvedValue([
        {
          id: 'evt-1',
          organizer_id: 'usr-org',
          name: 'Test Event',
          starts_at: '2026-11-15T00:00:00.000Z',
          ends_at: '2026-11-15T09:00:00.000Z',
          venue: 'Main Gym',
          registrations_count: 10,
          capacity: 100,
          status: 'Upcoming',
        },
      ]),
      findRegistrants: vi.fn().mockResolvedValue([]),
      cancelRegistrant: vi.fn().mockResolvedValue({
        id: 'tkt-1',
        name: 'Alice Smith',
        status: 'Cancelled',
      }),
      restoreRegistrant: vi.fn().mockResolvedValue({
        id: 'tkt-1',
        name: 'Alice Smith',
        status: 'Registered',
      }),
      create: vi.fn().mockResolvedValue({ id: 'evt-new', approval_status: 'Pending' }),
      findAllForAdmin: vi.fn().mockResolvedValue([]),
      review: vi.fn().mockResolvedValue({ id: 'evt-1', approval_status: 'Approved' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<EventsController>(EventsController);
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

  it('should return the current organizer events', async () => {
    const user = {
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'ORGANIZER' as const,
    };
    const res = await controller.getMyEvents(user);
    expect(res.success).toBe(true);
    expect(res.data[0].organizer_id).toBe('usr-org');
    expect(mockEventsService.findForOrganizer).toHaveBeenCalledWith(user);
  });

  it('should return registrants for an event', async () => {
    const user = {
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'ORGANIZER' as const,
    };
    const res = await controller.getRegistrants(user, 'evt-1');
    expect(res.success).toBe(true);
    expect(mockEventsService.findRegistrants).toHaveBeenCalledWith(user, 'evt-1');
  });

  it('should cancel a registrant', async () => {
    const user = {
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'ORGANIZER' as const,
    };
    const res = await controller.cancelRegistrant(user, 'evt-1', 'tkt-1');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('Cancelled');
    expect(mockEventsService.cancelRegistrant).toHaveBeenCalledWith(user, 'evt-1', 'tkt-1');
  });

  it('should restore a registrant', async () => {
    const user = {
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'ORGANIZER' as const,
    };
    const res = await controller.restoreRegistrant(user, 'evt-1', 'tkt-1');
    expect(res.success).toBe(true);
    expect(res.data.status).toBe('Registered');
    expect(mockEventsService.restoreRegistrant).toHaveBeenCalledWith(user, 'evt-1', 'tkt-1');
  });

  it('should submit a new event for review', async () => {
    const user = {
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'ORGANIZER' as const,
    };
    const dto = {
      name: 'New Event',
      venue: 'Hall',
      starts_at: '2027-01-01T09:00:00Z',
      ends_at: '2027-01-01T10:00:00Z',
      capacity: 20,
    };
    const res = await controller.createEvent(user, dto);
    expect(res.data.approval_status).toBe('Pending');
    expect(mockEventsService.create).toHaveBeenCalledWith(user, dto);
  });

  it('should pass admin list filters and review decisions to the service', async () => {
    const admin = {
      id: 'usr-admin',
      email: 'admin@dlsud.edu.ph',
      fullName: 'System Administrator',
      role: 'ADMIN' as const,
    };
    await controller.getAdminEvents(admin, 'pending');
    expect(mockEventsService.findAllForAdmin).toHaveBeenCalledWith(admin, 'pending');

    const res = await controller.reviewEvent(admin, 'evt-1', { decision: 'APPROVED' });
    expect(res.data.approval_status).toBe('Approved');
    expect(mockEventsService.review).toHaveBeenCalledWith(admin, 'evt-1', {
      decision: 'APPROVED',
    });
  });
});
