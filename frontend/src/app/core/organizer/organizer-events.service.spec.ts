import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { OrganizerEventsService } from './organizer-events.service';
import { EventRegistrant, OrganizerEvent } from './organizer.models';

describe('OrganizerEventsService', () => {
  let service: OrganizerEventsService;
  let httpTesting: HttpTestingController;

  const event: OrganizerEvent = {
    id: 'event-1',
    organizer_id: 'organizer-1',
    name: 'Test event',
    starts_at: '2026-11-18T09:00:00.000Z',
    ends_at: '2026-11-18T17:00:00.000Z',
    venue: 'Main Hall',
    registrations_count: 1,
    capacity: 10,
    status: 'Upcoming',
  };
  const registrant: EventRegistrant = {
    id: 'ticket-1',
    event_id: event.id,
    attendee_id: null,
    full_name: 'Test Attendee',
    email: 'attendee@example.com',
    ticket_id: 'CHK-2026-0001A',
    registered_at: '2026-10-12T10:15:00.000Z',
    status: 'Registered',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(AuthService).setSession(
      {
        id: 'organizer-1',
        email: 'organizer@example.com',
        fullName: 'Test Organizer',
        role: 'ORGANIZER',
      },
      'test-token',
    );
    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OrganizerEventsService);
    httpTesting
      .expectOne(`${environment.apiUrl}/events/organizer`)
      .flush({ success: true, data: { events: [event], registrants: [registrant] } });
  });

  afterEach(() => httpTesting.verify());

  it('should load organizer-owned events and registrants from the API', () => {
    expect(service.events()).toEqual([event]);
    expect(service.registrants()).toEqual([registrant]);
    expect(service.totalRegistrations()).toBe(1);
    expect(service.loading()).toBe(false);
  });

  it('should find an event by id', () => {
    expect(service.eventById(event.id)).toEqual(event);
  });

  it('should update event fields with updateEvent', () => {
    service.updateEvent(event.id, {
      name: 'Updated event',
      capacity: 50,
    });

    expect(service.eventById(event.id)?.name).toBe('Updated event');
    expect(service.eventById(event.id)?.capacity).toBe(50);
    expect(service.eventById(event.id)?.venue).toBe(event.venue);
  });

  it('should toggle registrant check-in status', () => {
    service.toggleCheckIn(registrant.id);
    expect(service.registrants()[0].status).toBe('Checked In');

    service.toggleCheckIn(registrant.id);
    expect(service.registrants()[0].status).toBe('Registered');
  });
});
