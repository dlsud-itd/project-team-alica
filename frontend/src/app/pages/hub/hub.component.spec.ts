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
});
