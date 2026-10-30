import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

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
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);
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
});

