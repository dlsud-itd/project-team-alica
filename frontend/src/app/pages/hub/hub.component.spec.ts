import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { HubComponent } from './hub.component';
import { AttendeeRsvpService } from '../../core/attendee/attendee-rsvp.service';
import { OrganizerEventsService } from '../../core/organizer/organizer-events.service';
import { ScannerApi } from '../../core/staff/scanner-api';
import { AuthService } from '../../core/auth/auth.service';

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
});
