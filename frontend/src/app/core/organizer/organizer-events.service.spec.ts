import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { OrganizerEventsService } from './organizer-events.service';
import { EventRegistrant, OrganizerEvent } from './organizer.models';

const API = `${environment.apiUrl}/events`;

const EVENT: OrganizerEvent = {
  id: 'evt-1',
  organizer_id: 'usr-org',
  name: 'Tech Summit',
  starts_at: '2026-11-15T00:00:00.000Z',
  ends_at: '2026-11-15T09:00:00.000Z',
  venue: 'Gymnasium',
  registrations_count: 2,
  capacity: 10,
  status: 'Upcoming',
};

const REGISTRANT: EventRegistrant = {
  id: 'tkt-1',
  event_id: 'evt-1',
  attendee_id: 'usr-1',
  full_name: 'Alyssa Santos',
  email: 'alyssa@example.com',
  ticket_id: 'CHK-2026-1234A',
  registered_at: '2026-10-12T02:15:00.000Z',
  status: 'Registered',
};

describe('OrganizerEventsService', () => {
  let service: OrganizerEventsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(OrganizerEventsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should start empty until events are loaded', () => {
    expect(service.events()).toEqual([]);
    expect(service.eventsLoaded()).toBe(false);
  });

  it('should load the organizer events from the API', () => {
    service.loadEvents().subscribe();
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [EVENT] });

    expect(service.events()).toEqual([EVENT]);
    expect(service.eventsLoaded()).toBe(true);
    expect(service.totalRegistrations()).toBe(2);
    expect(service.eventById('evt-1')).toEqual(EVENT);
  });

  it('should PATCH event changes and store the updated event', () => {
    service.loadEvents().subscribe();
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [EVENT] });

    service.updateEvent('evt-1', { name: 'Tech Summit Updated', capacity: 50 }).subscribe();
    const req = httpMock.expectOne(`${API}/evt-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Tech Summit Updated', capacity: 50 });
    req.flush({ success: true, data: { ...EVENT, name: 'Tech Summit Updated', capacity: 50 } });

    expect(service.eventById('evt-1')?.name).toBe('Tech Summit Updated');
    expect(service.eventById('evt-1')?.capacity).toBe(50);
  });

  it('should load registrants and toggle check-in through the API', () => {
    service.loadRegistrants('evt-1').subscribe();
    httpMock
      .expectOne(`${API}/evt-1/registrants`)
      .flush({ success: true, data: [REGISTRANT] });
    expect(service.registrants()).toEqual([REGISTRANT]);

    service.toggleCheckIn(REGISTRANT).subscribe();
    const req = httpMock.expectOne(`${API}/evt-1/registrants/tkt-1/check-in`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { ...REGISTRANT, status: 'Checked In' } });

    expect(service.registrants()[0].status).toBe('Checked In');
  });

  it('should expose loading and error state while loading events', () => {
    service.loadEvents().subscribe({ error: () => undefined });
    expect(service.loading()).toBe(true);

    httpMock
      .expectOne(`${API}/mine`)
      .flush({ message: 'Organizer access is required' }, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Organizer access is required');
  });

  it('should remove a deleted event and its registrants', () => {
    service.loadEvents().subscribe();
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [EVENT] });
    service.loadRegistrants('evt-1').subscribe();
    httpMock.expectOne(`${API}/evt-1/registrants`).flush({ success: true, data: [REGISTRANT] });

    service.deleteEvent('evt-1');

    expect(service.events()).toEqual([]);
    expect(service.registrants()).toEqual([]);
  });
});
