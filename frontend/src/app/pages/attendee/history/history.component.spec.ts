import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { History } from './history.component';
import { AttendeeRsvpService } from '../../../core/attendee/attendee-rsvp.service';
import { AttendeeRsvp } from '../../../core/attendee/attendee-rsvp.models';

const MOCK_RSVPS: AttendeeRsvp[] = [
  {
    ticketId: 'tkt-1',
    ticketCode: 'CHK-2026-1111A',
    qrPayload: 'CHK-2026-1111A',
    ticketType: 'STUDENT',
    status: 'Registered',
    registeredAt: '2026-10-31T10:00:00.000Z',
    firstScannedAt: null,
    eventId: 'evt-1',
    eventName: 'DLSU-D Tech Summit 2026',
    eventSlug: 'tech-summit-2026',
    venue: 'Ugnayang La Salle Gymnasium',
    startsAt: '2026-11-15T08:00:00.000Z',
    endsAt: '2026-11-15T17:00:00.000Z',
    category: 'CONFERENCE',
    categoryLabel: 'Conference',
    description: 'Summit details',
  },
  {
    ticketId: 'tkt-2',
    ticketCode: 'CHK-2026-2222B',
    qrPayload: 'CHK-2026-2222B',
    ticketType: 'STUDENT',
    status: 'Checked In',
    registeredAt: '2026-10-30T10:00:00.000Z',
    firstScannedAt: '2026-10-31T09:00:00.000Z',
    eventId: 'evt-2',
    eventName: 'AI & Agentic Systems Hackathon',
    eventSlug: 'ai-hackathon',
    venue: 'CBAA ICT Computer Labs',
    startsAt: '2026-11-22T08:00:00.000Z',
    endsAt: '2026-11-22T17:00:00.000Z',
    category: 'HACKATHON',
    categoryLabel: 'Hackathon',
    description: 'Hackathon details',
  },
  {
    ticketId: 'tkt-3',
    ticketCode: 'CHK-2026-3333C',
    qrPayload: 'CHK-2026-3333C',
    ticketType: 'STUDENT',
    status: 'Cancelled',
    registeredAt: '2026-10-29T10:00:00.000Z',
    firstScannedAt: null,
    eventId: 'evt-3',
    eventName: 'University Leadership Conclave',
    eventSlug: 'leadership-conclave',
    venue: 'Villarosa Convention Hall',
    startsAt: '2026-11-30T09:00:00.000Z',
    endsAt: '2026-11-30T17:00:00.000Z',
    category: 'WORKSHOP',
    categoryLabel: 'Workshop',
    description: 'Leadership workshop',
  },
];

describe('History', () => {
  let component: History;
  let fixture: ComponentFixture<History>;
  let rsvpService: AttendeeRsvpService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [History],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    rsvpService = TestBed.inject(AttendeeRsvpService);
    // Seed service state
    (rsvpService as unknown as { rsvpState: { set: (v: AttendeeRsvp[]) => void } }).rsvpState.set(
      MOCK_RSVPS,
    );

    fixture = TestBed.createComponent(History);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create and calculate summary counts', () => {
    expect(component).toBeTruthy();
    expect(component.totalCount()).toBe(3);
    expect(component.upcomingCount()).toBe(1);
    expect(component.checkedInCount()).toBe(1);
    expect(component.cancelledCount()).toBe(1);
  });

  it('should filter RSVPs by status tab', () => {
    expect(component.filteredRsvps().length).toBe(3);

    component.setStatusFilter('UPCOMING');
    expect(component.filteredRsvps().length).toBe(1);
    expect(component.filteredRsvps()[0].ticketCode).toBe('CHK-2026-1111A');

    component.setStatusFilter('CHECKED_IN');
    expect(component.filteredRsvps().length).toBe(1);
    expect(component.filteredRsvps()[0].ticketCode).toBe('CHK-2026-2222B');

    component.setStatusFilter('CANCELLED');
    expect(component.filteredRsvps().length).toBe(1);
    expect(component.filteredRsvps()[0].ticketCode).toBe('CHK-2026-3333C');

    component.setStatusFilter('ALL');
    expect(component.filteredRsvps().length).toBe(3);
  });

  it('should filter RSVPs by search text', () => {
    component.searchControl.setValue('Hackathon');
    expect(component.filteredRsvps().length).toBe(1);
    expect(component.filteredRsvps()[0].eventName).toBe('AI & Agentic Systems Hackathon');

    component.searchControl.setValue('Nonexistent');
    expect(component.filteredRsvps().length).toBe(0);

    component.searchControl.setValue('');
    expect(component.filteredRsvps().length).toBe(3);
  });

  it('should open and close QR pass modal', () => {
    component.openQrPass(MOCK_RSVPS[0]);
    expect(component.activeQrRsvp()?.ticketCode).toBe('CHK-2026-1111A');

    component.closeQrPass();
    expect(component.activeQrRsvp()).toBeNull();
    expect(component.qrDataUrl()).toBe('');
  });

  it('should open and dismiss cancel confirmation dialog', () => {
    component.initiateCancel(MOCK_RSVPS[0]);
    expect(component.cancellingRsvp()?.ticketCode).toBe('CHK-2026-1111A');

    component.dismissCancel();
    expect(component.cancellingRsvp()).toBeNull();
  });

  it('should execute cancellation and show feedback', () => {
    const cancelledRsvp = { ...MOCK_RSVPS[0], status: 'Cancelled' as const };
    vi.spyOn(rsvpService, 'cancelRsvp').mockReturnValue(of(cancelledRsvp));

    component.initiateCancel(MOCK_RSVPS[0]);
    component.confirmCancel();

    expect(rsvpService.cancelRsvp).toHaveBeenCalledWith('CHK-2026-1111A');
    expect(component.cancellingRsvp()).toBeNull();
    expect(component.feedbackMessage()).toContain('cancelled');
  });

  it('should return correct CSS classes for statuses and categories', () => {
    expect(component.statusClass('Registered')).toBe('status-registered');
    expect(component.statusClass('Checked In')).toBe('status-checked-in');
    expect(component.statusClass('Cancelled')).toBe('status-cancelled');

    expect(component.categoryClass('CONFERENCE')).toBe('category-conference');
    expect(component.categoryClass('HACKATHON')).toBe('category-hackathon');
    expect(component.categoryClass('WORKSHOP')).toBe('category-workshop');
    expect(component.categoryClass('EXPO')).toBe('category-expo');
  });
});
