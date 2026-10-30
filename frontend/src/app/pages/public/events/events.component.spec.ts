import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Events } from './events.component';
import { AuthService } from '../../../core/auth/auth.service';

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

    // Handle any initial SWR load request if made
    const reqs = httpMock.match((req) => req.url.includes('/events'));
    reqs.forEach((r) => r.flush({ success: true, data: [] }));
  });

  afterEach(() => {
    authService.logout(null);
    localStorage.clear();
  });

  it('should create successfully', () => {
    expect(component).toBeTruthy();
  });

  it('should list all initial seeded events', () => {
    expect(component.events().length).toBeGreaterThan(0);
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
