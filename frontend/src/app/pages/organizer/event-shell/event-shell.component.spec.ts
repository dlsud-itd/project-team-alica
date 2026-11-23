import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventShellComponent } from './event-shell.component';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

const MOCK_EVENT: OrganizerEvent = {
  id: 'evt-devcon-manila-2026',
  organizer_id: 'usr-org',
  name: 'DevCon Manila 2026',
  starts_at: '2026-09-24T08:00:00.000Z',
  ends_at: '2026-09-24T18:00:00.000Z',
  venue: 'SMX Convention Center, Mall of Asia',
  registrations_count: 1,
  capacity: 1240,
  status: 'Upcoming',
  description: 'Dev conference',
  allow_walk_ins: true,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-09-01T00:00:00.000Z',
};

describe('EventShellComponent', () => {
  let component: EventShellComponent;
  let fixture: ComponentFixture<EventShellComponent>;
  let organizerEventsMock: any;
  let userSignal: ReturnType<typeof signal<any>>;

  beforeEach(async () => {
    userSignal = signal({
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'USER',
    });

    organizerEventsMock = {
      events: () => [MOCK_EVENT],
      eventsLoaded: () => true,
      registrants: () => [],
      loadEvents: () => of([MOCK_EVENT]),
      updateEvent: () => of(MOCK_EVENT),
      deleteEvent: () => undefined,
    };

    await TestBed.configureTestingModule({
      imports: [EventShellComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ eventId: 'evt-devcon-manila-2026' })) },
        },
        { provide: AuthService, useValue: { user: userSignal } },
        { provide: OrganizerEventsService, useValue: organizerEventsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create event shell component', () => {
    expect(component).toBeTruthy();
  });

  it('should compute event category, short id, and dynamic organizer access', () => {
    expect(component.category()).toBe('CONFERENCE');
    expect(component.guestCount()).toBe(1);
    expect(component.isOrganizer()).toBe(true);
    expect(component.isStaff()).toBe(false);
  });

  it('should link the back button and post-delete redirect to /hub for organizers', () => {
    const backLink = (fixture.nativeElement as HTMLElement).querySelector('a.btn-back');
    expect(backLink?.getAttribute('href')).toBe('/hub');

    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.confirmDelete();
    expect(navSpy).toHaveBeenCalledWith(['/hub']);
  });
});

