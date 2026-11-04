import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EventCardData, Events } from './events.component';
import { AuthService } from '../../../core/auth/auth.service';

function apiEvent(
  overrides: Partial<EventCardData> & Pick<EventCardData, 'id' | 'title' | 'category'>,
): EventCardData {
  return {
    slug: overrides.id,
    description: '',
    categoryLabel: overrides.category,
    dateLabel: 'Nov 15, 2026',
    timeLabel: '8:00 AM - 5:00 PM',
    venue: 'Gymnasium',
    spotsTotal: 100,
    spotsTaken: 10,
    status: 'OPEN',
    statusLabel: 'Registration Open',
    organizerName: 'Campus Organizer',
    staffIds: [],
    registeredUserIds: [],
    ...overrides,
  };
}

// Shape returned by GET /events
const API_EVENTS: EventCardData[] = [
  apiEvent({
    id: 'evt-tech-summit-2026',
    title: 'DLSU-D Tech Summit 2026',
    category: 'CONFERENCE',
    organizerId: 'usr-organizer-campus',
    staffIds: ['usr-staff-station'],
    registeredUserIds: ['usr-attendee-alen'],
  }),
  apiEvent({
    id: 'evt-ai-hackathon-2026',
    title: 'AI & Agentic Systems Hackathon',
    category: 'HACKATHON',
    organizerId: 'usr-organizer-campus',
  }),
  apiEvent({
    id: 'evt-cloud-workshop',
    title: 'Cloud Masterclass',
    category: 'WORKSHOP',
    organizerId: 'usr-other-guild',
  }),
  apiEvent({
    id: 'evt-robotics-expo',
    title: 'Robotics Expo',
    category: 'EXPO',
    organizerId: 'usr-other-center',
  }),
];

describe('Events Component', () => {
  let component: Events;
  let fixture: ComponentFixture<Events>;
  let authService: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Events],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    authService.logout(null);

    fixture = TestBed.createComponent(Events);
    component = fixture.componentInstance;
    await fixture.whenStable();

    httpMock
      .expectOne((req) => req.url.endsWith('/events'))
      .flush({ success: true, data: API_EVENTS });
  });

  afterEach(() => {
    authService.logout(null);
    localStorage.clear();
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should list all events returned by the API', () => {
    expect(component.events()).toEqual(API_EVENTS);
    expect(component.filteredEvents().length).toBe(component.events().length);
  });

  it('should filter events when searching by keyword', () => {
    const inputEvent = { target: { value: 'hackathon' } } as unknown as Event;
    component.onSearch(inputEvent);

    const filtered = component.filteredEvents();
    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (ev) =>
          ev.title.toLowerCase().includes('hackathon') ||
          ev.category === 'HACKATHON',
      ),
    ).toBe(true);
  });

  it('should filter events when clicking category pill', () => {
    component.setCategory('WORKSHOP');
    const filtered = component.filteredEvents();
    expect(filtered.length).toBe(1);
    expect(filtered[0].category).toBe('WORKSHOP');
  });

  it('should reset search query and category filter', () => {
    component.setCategory('HACKATHON');
    component.searchQuery.set('xyz');
    expect(component.filteredEvents().length).toBe(0);

    component.resetFilters();
    expect(component.selectedCategory()).toBe('ALL');
    expect(component.searchQuery()).toBe('');
    expect(component.filteredEvents().length).toBe(component.events().length);
  });

  it('should open and close the RSVP modal', () => {
    const firstEvent = component.events()[0];
    component.openRsvp(firstEvent);

    expect(component.activeRsvpEvent()).toBe(firstEvent);
    expect(component.rsvpSuccess()).toBeNull();

    component.closeModal();
    expect(component.activeRsvpEvent()).toBeNull();
  });

  it('should resolve event roles correctly for different users', () => {
    const techSummit = component.events()[0];
    const hackathon = component.events()[1];

    // Guest has no special role
    expect(component.getEventRole(techSummit)).toBe('NONE');

    // Attendee with existing ticket
    authService.setSession(
      {
        id: 'usr-attendee-alen',
        email: 'amc.umandal@gmail.com',
        fullName: 'Alen Mikel Umandal',
        role: 'ATTENDEE',
      },
      'token',
    );
    expect(component.getEventRole(techSummit)).toBe('REGISTERED');
    expect(component.getEventRole(hackathon)).toBe('NONE');

    // Organizer of the event
    authService.setSession(
      {
        id: 'usr-organizer-campus',
        email: 'organizer@alica.ph',
        fullName: 'Campus Organizer',
        role: 'ORGANIZER',
      },
      'token',
    );
    expect(component.getEventRole(techSummit)).toBe('ORGANIZER');
    expect(component.getEventRole(hackathon)).toBe('ORGANIZER');

    // Assigned Checkpoint Staff
    authService.setSession(
      {
        id: 'usr-staff-station',
        email: 'staff@checkpoint.ph',
        fullName: 'Station Operator',
        role: 'STAFF',
      },
      'token',
    );
    expect(component.getEventRole(techSummit)).toBe('STAFF');
    expect(component.getEventRole(hackathon)).toBe('NONE');

    // Admin has universal management
    authService.setSession(
      {
        id: 'usr-admin-system',
        email: 'admin@dlsud.edu.ph',
        fullName: 'System Administrator',
        role: 'ADMIN',
      },
      'token',
    );
    expect(component.getEventRole(techSummit)).toBe('ADMIN');
    expect(component.getEventRole(hackathon)).toBe('ADMIN');
  });

  it('should filter only user events when MY_EVENTS category is selected', () => {
    authService.setSession(
      {
        id: 'usr-attendee-alen',
        email: 'amc.umandal@gmail.com',
        fullName: 'Alen Mikel Umandal',
        role: 'ATTENDEE',
      },
      'token',
    );

    component.setCategory('MY_EVENTS');
    const myEvents = component.filteredEvents();

    expect(myEvents.length).toBe(1);
    expect(myEvents[0].id).toBe('evt-tech-summit-2026');
  });
});
