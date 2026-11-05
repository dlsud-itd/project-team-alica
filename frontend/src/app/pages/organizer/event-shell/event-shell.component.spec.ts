import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventShellComponent } from './event-shell.component';
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

  beforeEach(async () => {
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

  it('should compute event category and short id', () => {
    expect(component.category()).toBe('CONFERENCE');
    expect(component.guestCount()).toBe(1);
  });
});

