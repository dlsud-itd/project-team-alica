import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { EventDetailsComponent, EventDetail } from './event-details.component';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

const mockEvent: EventDetail = {
  id: 'evt-devcon-manila-2026',
  slug: 'devcon-manila-2026',
  title: 'DevCon Manila 2026',
  description: 'The largest developer conference connecting tech innovators.',
  category: 'CONFERENCE',
  categoryLabel: 'Conference',
  dateLabel: 'Sep 24, 2026',
  timeLabel: '09:00 AM - 06:00 PM',
  venue: 'SMX Convention Center, Mall of Asia',
  spotsTotal: 500,
  spotsTaken: 42,
  status: 'OPEN',
  statusLabel: 'Registration Open',
  organizerName: 'DevCon Philippines',
  organizerId: 'usr-org',
  staffIds: [],
  registeredUserIds: ['user-123'],
  durationDays: 3,
  durationLabel: '3 Days',
  checkpointMode: 'Multi-stop Checks',
  scheduleDateLabel: 'September 24',
  bannerImageUrl: 'https://example.com/banner.jpg',
  schedule: [
    {
      id: 'sch-1',
      time: '09:00 AM',
      title: 'Opening Plenary',
      description: 'Keynote on tech communities in the Philippines',
      type: 'KEYNOTE',
      location: 'Function Room 1-3',
    },
    {
      id: 'sch-2',
      time: '10:30 AM',
      title: 'AI/ML Breakout',
      description: 'Deploying production grade LLMs',
      type: 'SESSION',
      location: 'Function Room 4',
    },
  ],
  speakers: [
    {
      id: 'spk-1',
      name: 'John Doe',
      role: 'Head of Product',
      company: 'DevCon PH',
    },
    {
      id: 'spk-2',
      name: 'Jane Smith',
      role: 'UX Research Lead',
      company: 'Studio Craft',
    },
  ],
};

describe('EventDetailsComponent', () => {
  let component: EventDetailsComponent;
  let fixture: ComponentFixture<EventDetailsComponent>;
  let httpTesting: HttpTestingController;
  let authServiceSpy: any;

  beforeEach(async () => {
    authServiceSpy = {
      user: () => null,
      isAuthenticated: () => false,
      getProfiles: () => of([]),
      saveProfile: () => of({ id: 'p1', profileName: 'Test', fullName: 'Test', studentId: '123' }),
    };

    await TestBed.configureTestingModule({
      imports: [EventDetailsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of({
              get: (key: string) => (key === 'idOrSlug' ? 'devcon-manila-2026' : null),
            }),
          },
        },
        { provide: AuthService, useValue: authServiceSpy },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EventDetailsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('creates component and loads event details from API', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/events/devcon-manila-2026`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: mockEvent });

    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.event()?.title).toBe('DevCon Manila 2026');
    expect(component.event()?.durationLabel).toBe('3 Days');
    expect(component.event()?.checkpointMode).toBe('Multi-stop Checks');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nav-event-title')?.textContent).toContain('DevCon Manila 2026');
    expect(compiled.querySelector('.hero-chips-bar')?.textContent).toContain('3 Days');
    expect(compiled.querySelector('.hero-chips-bar')?.textContent).toContain('Multi-stop Checks');
    expect(compiled.querySelector('.hero-chips-bar')?.textContent).toContain('500 Seats');
  });

  it('renders schedule timeline with time badges and session cards', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/events/devcon-manila-2026`);
    req.flush({ success: true, data: mockEvent });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const timelineItems = compiled.querySelectorAll('.timeline-item');
    expect(timelineItems.length).toBe(2);

    expect(timelineItems[0].querySelector('.time-badge')?.textContent).toContain('09:00 AM');
    expect(timelineItems[0].querySelector('.timeline-card-title')?.textContent).toContain('Opening Plenary');
    expect(timelineItems[1].querySelector('.time-badge')?.textContent).toContain('10:30 AM');
    expect(timelineItems[1].querySelector('.timeline-card-title')?.textContent).toContain('AI/ML Breakout');
  });

  it('renders featured speakers with names and roles', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/events/devcon-manila-2026`);
    req.flush({ success: true, data: mockEvent });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const speakerCards = compiled.querySelectorAll('.speaker-card');
    expect(speakerCards.length).toBe(2);

    expect(speakerCards[0].querySelector('.speaker-name')?.textContent).toContain('John Doe');
    expect(speakerCards[0].querySelector('.speaker-role')?.textContent).toContain('Head of Product · DevCon PH');
    expect(speakerCards[1].querySelector('.speaker-name')?.textContent).toContain('Jane Smith');
  });

  it('shows RSVP button when attendee is not registered', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/events/devcon-manila-2026`);
    req.flush({ success: true, data: mockEvent });

    fixture.detectChanges();

    expect(component.isRegistered()).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    const ctaBtn = compiled.querySelector('.btn-primary-cta');
    expect(ctaBtn?.textContent).toContain('RSVP for Event / Claim Pass');

    component.openRsvpModal();
    fixture.detectChanges();
    expect(component.isRsvpOpen()).toBe(true);
  });

  it('shows Already Registered button when authenticated user is registered', () => {
    authServiceSpy.user = () => ({ id: 'user-123', email: 'attendee@test.com', fullName: 'Alex Martin', role: 'USER' });

    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/events/devcon-manila-2026`);
    req.flush({ success: true, data: mockEvent });

    fixture.detectChanges();

    expect(component.isRegistered()).toBe(true);

    const compiled = fixture.nativeElement as HTMLElement;
    const ctaBtn = compiled.querySelector('.btn-already-registered');
    expect(ctaBtn).toBeTruthy();
    expect(ctaBtn?.textContent).toContain('Already Registered (Go to Pass)');
  });
});
