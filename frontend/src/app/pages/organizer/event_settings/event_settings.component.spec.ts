import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventOrganizer, OrganizerCandidate, OrganizerEvent } from '../../../core/organizer/organizer.models';
import { EventSettingsComponent } from './event_settings.component';

const MOCK_EVENT: OrganizerEvent = {
  id: 'evt-settings-1',
  organizer_id: 'usr-primary-org',
  name: 'Innovation Summit 2026',
  starts_at: '2026-11-20T08:00:00.000Z',
  ends_at: '2026-11-20T17:00:00.000Z',
  venue: 'Innovation Hall',
  registrations_count: 5,
  capacity: 200,
  status: 'Upcoming',
  description: 'Flagship innovation event',
  allow_walk_ins: true,
  require_student_id: true,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-01T00:00:00.000Z',
  is_private: false,
  category: 'Conference',
};

const MOCK_ORGANIZERS: EventOrganizer[] = [
  {
    id: 'primary-usr-primary-org',
    userId: 'usr-primary-org',
    email: 'primary@alica.ph',
    fullName: 'Primary Organizer',
    affiliation: 'CSCS',
    assignedAt: '2026-10-01T00:00:00.000Z',
    isPrimary: true,
  },
  {
    id: 'eo-co-1',
    userId: 'usr-co-1',
    email: 'coorganizer@alica.ph',
    fullName: 'Co Organizer',
    affiliation: 'USC',
    assignedAt: '2026-10-05T00:00:00.000Z',
    isPrimary: false,
  },
];

describe('EventSettingsComponent', () => {
  let component: EventSettingsComponent;
  let fixture: ComponentFixture<EventSettingsComponent>;
  let mockOrganizerEvents: {
    events: () => OrganizerEvent[];
    eventsLoaded: () => boolean;
    loadEvents: ReturnType<typeof vi.fn>;
    loadOrganizers: ReturnType<typeof vi.fn>;
    addOrganizer: ReturnType<typeof vi.fn>;
    removeOrganizer: ReturnType<typeof vi.fn>;
    searchOrganizerCandidates: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
    deleteEvent: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    user: () => { id: string; role: string; fullName: string; email: string } | null;
    token: () => string;
  };
  let mockRouter: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const candidate: OrganizerCandidate = {
      id: 'usr-cand-1',
      email: 'candidate@alica.ph',
      fullName: 'Candidate User',
      affiliation: 'CSCS',
    };

    mockOrganizerEvents = {
      events: () => [MOCK_EVENT],
      eventsLoaded: () => true,
      loadEvents: vi.fn().mockReturnValue(of([MOCK_EVENT])),
      loadOrganizers: vi.fn().mockReturnValue(of(MOCK_ORGANIZERS)),
      addOrganizer: vi.fn().mockReturnValue(
        of({
          id: 'eo-new',
          userId: 'usr-new',
          email: 'newco@alica.ph',
          fullName: 'New Co',
          affiliation: null,
          assignedAt: new Date().toISOString(),
          isPrimary: false,
        }),
      ),
      removeOrganizer: vi.fn().mockReturnValue(of(undefined)),
      searchOrganizerCandidates: vi.fn().mockReturnValue(of([candidate])),
      updateEvent: vi.fn().mockReturnValue(
        of({ ...MOCK_EVENT, is_private: true, allow_walk_ins: false, require_student_id: false }),
      ),
      deleteEvent: vi.fn().mockReturnValue(of(undefined)),
    };

    mockAuth = {
      user: () => ({
        id: 'usr-primary-org',
        role: 'ORGANIZER',
        fullName: 'Primary Organizer',
        email: 'primary@alica.ph',
      }),
      token: () => 'mock-jwt-token',
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [EventSettingsComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              paramMap: of({ get: () => 'evt-settings-1' }),
            },
            snapshot: {
              paramMap: { get: () => 'evt-settings-1' },
            },
          },
        },
        { provide: OrganizerEventsService, useValue: mockOrganizerEvents },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and populate event policies form', () => {
    expect(component).toBeTruthy();
    expect(component.eventId()).toBe('evt-settings-1');
    expect(component.policiesForm.get('is_private')?.value).toBe(false);
    expect(component.policiesForm.get('allow_walk_ins')?.value).toBe(true);
    expect(component.policiesForm.get('require_student_id')?.value).toBe(true);
  });

  it('should link to ../overview for event details editing', () => {
    const link = (fixture.nativeElement as HTMLElement).querySelector('.banner-link');
    expect(link?.textContent?.trim()).toBe('Overview');
  });

  it('should load organizers and distinguish primary from co-organizers', () => {
    expect(mockOrganizerEvents.loadOrganizers).toHaveBeenCalledWith('evt-settings-1');
    expect(component.organizers().length).toBe(2);
    expect(component.primaryOrganizer()?.email).toBe('primary@alica.ph');
    expect(component.coOrganizers().length).toBe(1);
    expect(component.coOrganizers()[0].email).toBe('coorganizer@alica.ph');
  });

  it('should save visibility, walk-in, and student ID policies', () => {
    component.policiesForm.patchValue({
      is_private: true,
      allow_walk_ins: false,
      require_student_id: false,
    });

    component.savePolicies();

    expect(mockOrganizerEvents.updateEvent).toHaveBeenCalledWith('evt-settings-1', {
      is_private: true,
      allow_walk_ins: false,
      require_student_id: false,
    });
    expect(component.policiesSuccess()).toContain('Innovation Summit 2026');
  });

  it('should add a co-organizer member directly or from directory candidate', () => {
    const input = document.createElement('input');
    input.value = 'newco@alica.ph';

    component.addOrganizerMember(input);
    expect(mockOrganizerEvents.addOrganizer).toHaveBeenCalledWith('evt-settings-1', 'newco@alica.ph');
    expect(input.value).toBe('');
    expect(component.organizerSuccess()).toContain('newco@alica.ph');

    component.selectCandidate(
      {
        id: 'usr-cand-1',
        email: 'candidate@alica.ph',
        fullName: 'Candidate User',
        affiliation: 'CSCS',
      },
      input,
    );
    expect(mockOrganizerEvents.addOrganizer).toHaveBeenCalledWith('evt-settings-1', 'candidate@alica.ph');
  });

  it('should remove a co-organizer member', () => {
    component.removeOrganizerMember('usr-co-1');
    expect(mockOrganizerEvents.removeOrganizer).toHaveBeenCalledWith('evt-settings-1', 'usr-co-1');
    expect(component.organizerSuccess()).toContain('Co-organizer removed');
  });

  it('should confirm delete and navigate to /hub', () => {
    component.openDelete();
    expect(component.deleting()).toBe(true);

    component.confirmDelete();
    expect(mockOrganizerEvents.deleteEvent).toHaveBeenCalledWith('evt-settings-1');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/hub']);
  });
});
