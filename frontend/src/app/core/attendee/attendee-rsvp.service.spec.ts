import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AttendeeRsvpService } from './attendee-rsvp.service';
import { AttendeeRsvp } from './attendee-rsvp.models';

const API = `${environment.apiUrl}/registrations`;

const MOCK_RSVP: AttendeeRsvp = {
  ticketId: 'tkt-1',
  ticketCode: 'CHK-2026-9812A',
  qrPayload: 'CHK-2026-9812A',
  ticketType: 'STUDENT',
  status: 'Registered',
  registeredAt: '2026-10-31T10:00:00.000Z',
  firstScannedAt: null,
  eventId: 'evt-1',
  eventName: 'DLSU-D Tech Summit 2026',
  eventSlug: 'dlsu-d-tech-summit-2026',
  venue: 'Ugnayang La Salle Gymnasium',
  startsAt: '2026-11-15T08:00:00.000Z',
  endsAt: '2026-11-15T17:00:00.000Z',
  category: 'CONFERENCE',
  categoryLabel: 'Conference',
  description: 'Annual technology convention',
};

describe('AttendeeRsvpService', () => {
  let service: AttendeeRsvpService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AttendeeRsvpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should start with empty rsvps', () => {
    expect(service.rsvps()).toEqual([]);
    expect(service.loading()).toBe(false);
  });

  it('should fetch attendee rsvps from the API', () => {
    service.loadMyRsvps().subscribe();
    expect(service.loading()).toBe(true);

    const req = httpMock.expectOne(`${API}/mine`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: [MOCK_RSVP] });

    expect(service.loading()).toBe(false);
    expect(service.rsvps()).toEqual([MOCK_RSVP]);
  });

  it('should handle API errors when fetching rsvps', () => {
    service.loadMyRsvps().subscribe({ error: () => undefined });

    const req = httpMock.expectOne(`${API}/mine`);
    req.flush({ message: 'Session expired' }, { status: 401, statusText: 'Unauthorized' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('Session expired');
  });

  it('should cancel an RSVP and update the stored state', () => {
    service.loadMyRsvps().subscribe();
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [MOCK_RSVP] });

    service.cancelRsvp('CHK-2026-9812A').subscribe();
    const req = httpMock.expectOne(`${API}/CHK-2026-9812A/cancel`);
    expect(req.request.method).toBe('PATCH');
    req.flush({ success: true, data: { ...MOCK_RSVP, status: 'Cancelled' } });

    expect(service.rsvps()[0].status).toBe('Cancelled');
  });

  it('should generate a QR data URL', async () => {
    const dataUrl = await new Promise<string>((resolve) => {
      service.generateQrCode('CHK-2026-TEST').subscribe((url) => resolve(url));
    });
    expect(dataUrl).toContain('data:image/png;base64,');
  });
});
