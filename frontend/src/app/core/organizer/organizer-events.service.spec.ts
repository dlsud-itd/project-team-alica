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
  description: '',
  allow_walk_ins: false,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-01T00:00:00.000Z',
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

  it('should POST a new event and add the pending event to the list', () => {
    const draft = {
      name: 'AI Workshop',
      description: 'Hands-on session',
      venue: 'Lab 1',
      starts_at: '2026-12-01T01:00:00.000Z',
      ends_at: '2026-12-01T04:00:00.000Z',
      capacity: 40,
      allow_walk_ins: false,
    };
    service.createEvent(draft).subscribe();
    const req = httpMock.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(draft);
    req.flush({
      success: true,
      data: { ...EVENT, ...draft, id: 'evt-2', registrations_count: 0, approval_status: 'Pending' },
    });

    expect(service.eventById('evt-2')?.approval_status).toBe('Pending');
  });

  it('should load registrants and toggle check-in through the API', () => {
    service.loadRegistrants('evt-1').subscribe();
    httpMock.expectOne(`${API}/evt-1/registrants`).flush({ success: true, data: [REGISTRANT] });
    expect(service.registrants()).toEqual([REGISTRANT]);

    service.toggleCheckIn(REGISTRANT).subscribe();
    const req = httpMock.expectOne(`${API}/evt-1/registrants/tkt-1/check-in`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { ...REGISTRANT, status: 'Checked In' } });

    expect(service.registrants()[0].status).toBe('Checked In');
  });

  it('should upload a guest list and return imported account results', () => {
    const file = new File(
      ['First Name,Last Name,Email\nAlex,Guest,alex@example.org'],
      'guests.csv',
      { type: 'text/csv' },
    );
    const expected = {
      created: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'alex@example.org',
          fullName: 'Alex Guest',
          ticketId: 'ticket-1',
          ticketCode: 'CHK-TEST',
          emailStatus: 'SENT' as const,
        },
      ],
      skipped: [],
      emailFailures: [],
      summary: { created: 1, skipped: 0, emailFailures: 0 },
      credentials: [{ email: 'alex@example.org', temporaryPassword: 'a1B2c3D4e5' }],
    };

    service.loadEvents().subscribe();
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [EVENT] });

    let response: unknown;
    service.importGuestUsers('evt-1', file, true).subscribe((result) => {
      response = result;
    });

    const req = httpMock.expectOne(`${API}/evt-1/guests/import-users`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBeInstanceOf(FormData);
    expect((req.request.body as FormData).get('file')).toBe(file);
    expect((req.request.body as FormData).get('includeCredentials')).toBe('true');
    req.flush({ success: true, data: expected });

    expect(response).toEqual(expected);
    expect(service.eventById('evt-1')?.registrations_count).toBe(3);
  });

  it('should cancel a registrant through the API and update state', () => {
    service.loadRegistrants('evt-1').subscribe();
    httpMock.expectOne(`${API}/evt-1/registrants`).flush({ success: true, data: [REGISTRANT] });

    service.cancelRegistrant('evt-1', 'tkt-1').subscribe();
    const req = httpMock.expectOne(`${API}/evt-1/registrants/tkt-1/cancel`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { ...REGISTRANT, status: 'Cancelled' } });

    expect(service.registrants()[0].status).toBe('Cancelled');
  });

  it('should restore a registrant through the API and update state', () => {
    const cancelledRegistrant = { ...REGISTRANT, status: 'Cancelled' as const };
    service.loadRegistrants('evt-1').subscribe();
    httpMock
      .expectOne(`${API}/evt-1/registrants`)
      .flush({ success: true, data: [cancelledRegistrant] });

    service.restoreRegistrant('evt-1', 'tkt-1').subscribe();
    const req = httpMock.expectOne(`${API}/evt-1/registrants/tkt-1/restore`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { ...cancelledRegistrant, status: 'Registered' } });

    expect(service.registrants()[0].status).toBe('Registered');
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

  it('should load live overview, checkpoints, record scan, and export csv', () => {
    service.loadLiveOverview('evt-1').subscribe((res) => {
      expect(res.name).toBe('Tech Summit');
    });
    httpMock
      .expectOne(`${API}/evt-1/live-overview`)
      .flush({ success: true, data: { name: 'Tech Summit' } });

    service.loadEventCheckpoints('evt-1').subscribe((res) => {
      expect(res.length).toBe(1);
    });
    httpMock
      .expectOne(`${API}/evt-1/checkpoints`)
      .flush({ success: true, data: [{ id: 'chk-1', name: 'Main Gate' }] });

    service.recordScan('evt-1', 'chk-1', 'TKT-1').subscribe((res) => {
      expect(res.scanResult).toBe('SUCCESS');
    });
    const scanReq = httpMock.expectOne(`${API}/evt-1/checkpoints/chk-1/scan`);
    expect(scanReq.request.method).toBe('POST');
    expect(scanReq.request.body).toEqual({ ticketCode: 'TKT-1' });
    scanReq.flush({ success: true, data: { scanResult: 'SUCCESS', ticketCode: 'TKT-1' } });

    service.exportScansCsv('evt-1').subscribe((res) => {
      expect(res).toContain('Ticket Code');
    });
    httpMock
      .expectOne(`${API}/evt-1/scans/export`)
      .flush({ success: true, data: 'Ticket Code,Attendee Name\nTKT-1,John' });
  });

  it('should load, add, and remove event organizers', () => {
    service.loadOrganizers('evt-1').subscribe((orgs) => {
      expect(orgs.length).toBe(1);
      expect(orgs[0].email).toBe('org@example.com');
    });
    httpMock
      .expectOne(`${API}/evt-1/organizers`)
      .flush({ success: true, data: [{ id: '1', email: 'org@example.com', fullName: 'Org', isPrimary: true }] });

    service.addOrganizer('evt-1', 'co@example.com').subscribe((added) => {
      expect(added.email).toBe('co@example.com');
    });
    const addReq = httpMock.expectOne(`${API}/evt-1/organizers`);
    expect(addReq.request.method).toBe('POST');
    expect(addReq.request.body).toEqual({ email: 'co@example.com' });
    addReq.flush({ success: true, data: { id: '2', email: 'co@example.com', fullName: 'Co', isPrimary: false } });

    service.removeOrganizer('evt-1', 'usr-co').subscribe();
    const delReq = httpMock.expectOne(`${API}/evt-1/organizers/usr-co`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ success: true });
  });
});
