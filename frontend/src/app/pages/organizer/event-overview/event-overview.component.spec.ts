import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventOverviewComponent } from './event-overview.component';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { environment } from '../../../../environments/environment';

describe('EventOverviewComponent', () => {
  let fixture: ComponentFixture<EventOverviewComponent>;
  let httpTesting: HttpTestingController;
  let userSignal: ReturnType<typeof signal<any>>;

  beforeEach(async () => {
    userSignal = signal({ id: 'usr-org', email: 'o@alica.ph', fullName: 'Org', role: 'USER' });
    await TestBed.configureTestingModule({
      imports: [EventOverviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { parent: { paramMap: of(new Map([['eventId', 'evt-1']])) } } },
        {
          provide: AuthService,
          useValue: { user: userSignal, isAuthenticated: () => true, getProfiles: () => of([]) },
        },
        {
          provide: OrganizerEventsService,
          useValue: { events: signal([{ id: 'evt-1', organizer_id: 'usr-org' }]) },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EventOverviewComponent);
    fixture.detectChanges();
  });

  it('previews the public event page for this event', () => {
    const req = httpTesting.expectOne(`${environment.apiUrl}/events/evt-1`);
    expect(req.request.method).toBe('GET');
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-event-details')).toBeTruthy();
    expect(el.textContent).toContain('Attendee view');
  });

  it('links organizers to Settings, and everyone to the public page', () => {
    httpTesting.expectOne(`${environment.apiUrl}/events/evt-1`);
    const el = fixture.nativeElement as HTMLElement;
    const links = () => Array.from(el.querySelectorAll('.preview-link')).map((a) => a.textContent?.trim());
    expect(links()).toEqual(['Edit details & program', 'Open public page']);

    userSignal.set({ id: 'usr-staff', email: 's@alica.ph', fullName: 'Staff', role: 'USER' });
    fixture.detectChanges();
    expect(links()).toEqual(['Open public page']);
  });
});
