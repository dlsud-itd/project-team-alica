import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HubComponent } from './hub.component';
import { AttendeeRsvpService } from '../../core/attendee/attendee-rsvp.service';
import { OrganizerEventsService } from '../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../core/organizer/organizer.models';
import { ScannerApi } from '../../core/staff/scanner-api';
import { AuthService } from '../../core/auth/auth.service';
import { AttendeeRsvp } from '../../core/attendee/attendee-rsvp.models';
import { TicketQrService } from '../../core/tickets/ticket-qr.service';

describe('HubComponent', () => {
  let component: HubComponent;
  let fixture: ComponentFixture<HubComponent>;
  let rsvpService: AttendeeRsvpService;
  let organizerService: OrganizerEventsService;
  let scannerApi: ScannerApi;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    rsvpService = TestBed.inject(AttendeeRsvpService);
    organizerService = TestBed.inject(OrganizerEventsService);
    scannerApi = TestBed.inject(ScannerApi);
    authService = TestBed.inject(AuthService);

    authService.setSession(
      {
        id: 'u-1',
        email: 'user@dlsud.edu.ph',
        fullName: 'Juan Dela Cruz',
        role: 'USER',
      },
      'token',
    );

    vi.spyOn(rsvpService, 'loadMyRsvps').mockReturnValue(of([]));
    vi.spyOn(organizerService, 'loadEvents').mockReturnValue(of([]));
    vi.spyOn(scannerApi, 'getMyCheckpoints').mockReturnValue(of([]));

    fixture = TestBed.createComponent(HubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the hub component', () => {
    expect(component).toBeTruthy();
  });

  it('defaults to the attending tab', () => {
    expect(component.activeTab()).toBe('attending');
  });

  it('switches tabs cleanly', () => {
    component.setTab('organizing');
    expect(component.activeTab()).toBe('organizing');

    component.setTab('staffing');
    expect(component.activeTab()).toBe('staffing');

    component.setTab('attending');
    expect(component.activeTab()).toBe('attending');
  });

  it('opens and closes the create event modal', () => {
    expect(component.isCreateModalOpen()).toBe(false);
    component.openCreateModal();
    expect(component.isCreateModalOpen()).toBe(true);
    component.closeCreateModal();
    expect(component.isCreateModalOpen()).toBe(false);
  });

  it('handles wizard saved event and navigates to event overview', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.openCreateModal();
    expect(component.isCreateModalOpen()).toBe(true);

    component.onWizardSaved({ id: 'evt-created' } as OrganizerEvent);
    expect(component.isCreateModalOpen()).toBe(false);
    expect(navSpy).toHaveBeenCalledWith(['/organizer/events', 'evt-created', 'overview']);
  });

  it('does not display the staffing tab button for normal users with no assignments', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const tabButtons = compiled.querySelectorAll('.tab-btn');
    const tabTexts = Array.from(tabButtons).map((btn) => btn.textContent);
    expect(tabTexts.some((text) => text?.includes('Staffing'))).toBe(false);
  });

  it('displays the staffing tab button when user has assigned checkpoints', () => {
    component.assignedCheckpoints.set([
      {
        id: 'chk-1',
        name: 'Gate 1',
        location: 'North',
        type: 'MAIN_ENTRY',
        allowMultipleScans: false,
        requireMainEntry: false,
        eventId: 'evt-1',
        eventName: 'Tech Summit',
      },
    ]);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const tabButtons = compiled.querySelectorAll('.tab-btn');
    const tabTexts = Array.from(tabButtons).map((btn) => btn.textContent);
    expect(tabTexts.some((text) => text?.includes('Staffing'))).toBe(true);
  });

  describe('organized event review notes', () => {
    const baseEvent: OrganizerEvent = {
      id: 'evt-1',
      organizer_id: 'u-1',
      name: 'Org Fair',
      starts_at: '2026-12-01T09:00:00Z',
      ends_at: '2026-12-01T17:00:00Z',
      venue: 'Gym',
      registrations_count: 0,
      capacity: 100,
      status: 'Upcoming',
      description: '',
      allow_walk_ins: false,
      approval_status: 'Pending',
      review_notes: null,
      reviewed_at: null,
      submitted_at: '2026-11-14T00:00:00Z',
      is_private: false,
    };

    const renderOrganizing = (event: OrganizerEvent): HTMLElement | null => {
      (organizerService as unknown as { eventState: { set(v: OrganizerEvent[]): void } }).eventState.set([event]);
      component.setTab('organizing');
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('.review-note');
    };

    it('tells the organizer a public event is waiting for review', () => {
      const note = renderOrganizing(baseEvent);
      expect(note?.textContent).toContain('Waiting for admin review');
    });

    it('shows the admin rejection reason', () => {
      const note = renderOrganizing({
        ...baseEvent,
        approval_status: 'Rejected',
        review_notes: 'Venue is unavailable on that date.',
        reviewed_at: '2026-11-14T08:00:00Z',
      });
      expect(note?.getAttribute('data-status')).toBe('Rejected');
      expect(note?.textContent).toContain('Rejected by admin');
      expect(note?.textContent).toContain('Venue is unavailable on that date.');
    });

    it('shows nothing for an approved event without notes', () => {
      const note = renderOrganizing({ ...baseEvent, approval_status: 'Approved' });
      expect(note).toBeNull();
    });
  });

  it('manages co-organizers during event creation', () => {
    component.openCreateModal();
    const mockInput = { value: 'coorg@dlsud.edu.ph' } as HTMLInputElement;

    component.addCoOrganizerEmail(mockInput);
    expect(component.coOrganizerEmails()).toEqual(['coorg@dlsud.edu.ph']);
    expect(mockInput.value).toBe('');

    // reject duplicate
    mockInput.value = 'coorg@dlsud.edu.ph';
    component.addCoOrganizerEmail(mockInput);
    expect(component.coOrganizerEmails().length).toBe(1);

    // reject invalid
    mockInput.value = 'invalid-email';
    component.addCoOrganizerEmail(mockInput);
    expect(component.createEventError()).toContain('valid email');
    expect(component.coOrganizerEmails().length).toBe(1);

    // remove
    component.removeCoOrganizerEmail(0);
    expect(component.coOrganizerEmails().length).toBe(0);
  });

  it('renders the pass QR with the shared ticket renderer, matching Full Details', async () => {
    const rsvp = {
      ticketCode: 'CHK-0F3A9C2E-1B7D-4E2A-9C1F-6D8E2A4B7C90',
      qrPayload: 'CHK-0F3A9C2E-1B7D-4E2A-9C1F-6D8E2A4B7C90',
      status: 'Registered',
      eventName: 'Tech Summit',
    } as AttendeeRsvp;

    component.openQrPass(rsvp);
    await vi.waitFor(() => expect(component.qrLoading()).toBe(false));

    // /profile/:ticketCode renders through the same service from the same payload.
    const expected = await TestBed.inject(TicketQrService).toDataUrl({
      ticketCode: rsvp.ticketCode,
      qrPayload: rsvp.qrPayload,
    });
    expect(component.qrDataUrl()).toBe(expected);
  });
});
