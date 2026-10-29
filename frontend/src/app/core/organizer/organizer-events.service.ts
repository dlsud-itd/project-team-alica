import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { EventRegistrant, OrganizerEvent, UUID } from './organizer.models';

const MOCK_EVENTS: OrganizerEvent[] = [
  {
    id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123001',
    organizer_id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123000',
    name: 'ALCIA Tech Summit 2026',
    starts_at: '2026-11-18T09:00:00+08:00',
    ends_at: '2026-11-18T17:00:00+08:00',
    venue: 'Henry Sy Sr. Hall',
    city: 'Dasmarinas, Cavite',
    registrations_count: 4,
    capacity: 10,
    status: 'Upcoming',
  },
  {
    id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123002',
    organizer_id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123000',
    name: 'Design Forward: Campus Creatives',
    starts_at: '2026-12-03T13:00:00+08:00',
    ends_at: '2026-12-03T18:00:00+08:00',
    venue: 'DLSU-D Student Union',
    city: 'Dasmarinas, Cavite',
    registrations_count: 1,
    capacity: 5,
    status: 'Upcoming',
  },
  {
    id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123003',
    organizer_id: 'a1b2c3d4-e5f6-47a8-9012-abcdef123000',
    name: 'Community Startup Weekend',
    starts_at: '2026-12-14T08:30:00+08:00',
    ends_at: '2026-12-15T20:00:00+08:00',
    venue: 'Innovation Hub',
    city: 'Imus, Cavite',
    registrations_count: 0,
    capacity: 20,
    status: 'Upcoming',
  },
];

const MOCK_REGISTRANTS: EventRegistrant[] = [
  {
    id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123101',
    event_id: MOCK_EVENTS[0].id,
    attendee_id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123201',
    full_name: 'Alyssa Santos',
    email: 'alyssa.santos@example.com',
    ticket_id: 'ALC-26-000184',
    registered_at: '2026-10-12T10:15:00+08:00',
    status: 'Registered',
  },
  {
    id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123102',
    event_id: MOCK_EVENTS[0].id,
    attendee_id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123202',
    full_name: 'Miguel Reyes',
    email: 'miguel.reyes@example.com',
    ticket_id: 'ALC-26-000183',
    registered_at: '2026-10-12T09:40:00+08:00',
    status: 'Checked In',
  },
  {
    id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123103',
    event_id: MOCK_EVENTS[0].id,
    attendee_id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123203',
    full_name: 'Bianca Cruz',
    email: 'bianca.cruz@example.com',
    ticket_id: 'ALC-26-000182',
    registered_at: '2026-10-11T15:22:00+08:00',
    status: 'Cancelled',
  },
  {
    id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123104',
    event_id: MOCK_EVENTS[0].id,
    attendee_id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123204',
    full_name: 'Noah Garcia',
    email: 'noah.garcia@example.com',
    ticket_id: 'ALC-26-000181',
    registered_at: '2026-10-10T12:05:00+08:00',
    status: 'Registered',
  },
  {
    id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123105',
    event_id: MOCK_EVENTS[1].id,
    attendee_id: 'b2c3d4e5-f6a7-48b9-8012-abcdef123205',
    full_name: 'Sofia Mendoza',
    email: 'sofia.mendoza@example.com',
    ticket_id: 'DF-26-000096',
    registered_at: '2026-10-08T11:30:00+08:00',
    status: 'Registered',
  },
];

@Injectable({ providedIn: 'root' })
export class OrganizerEventsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  private readonly eventState = signal<OrganizerEvent[]>(MOCK_EVENTS);
  private readonly registrantState = signal<EventRegistrant[]>(MOCK_REGISTRANTS);

  readonly events = this.eventState.asReadonly();
  readonly registrants = this.registrantState.asReadonly();

  readonly totalRegistrations = computed(() =>
    this.eventState().reduce((total, event) => total + event.registrations_count, 0),
  );

  constructor() {
    this.loadEvents();
  }

  loadEvents(): void {
    this.http.get<{ success: boolean; data: any[] }>(`${this.api}/events`).subscribe({
      next: (res) => {
        if (!res?.data || !Array.isArray(res.data)) return;
        const apiEvents: OrganizerEvent[] = res.data.map((ev) => ({
          id: ev.id,
          organizer_id: ev.organizerId || 'usr-organizer-campus',
          name: ev.title,
          starts_at: ev.dateLabel || new Date().toISOString(),
          ends_at: ev.timeLabel || new Date().toISOString(),
          venue: ev.venue || 'Campus Venue',
          city: 'Dasmarinas, Cavite',
          registrations_count: ev.spotsTaken ?? 0,
          capacity: ev.spotsTotal ?? 100,
          status: ev.status === 'LIVE_TODAY' ? 'In progress' : 'Upcoming',
        }));

        // Merge with mock events so mock fixture routes remain functional
        const merged = [...apiEvents];
        for (const mock of MOCK_EVENTS) {
          if (!merged.some((e) => e.id === mock.id)) {
            merged.push(mock);
          }
        }
        this.eventState.set(merged);
      },
      error: () => {
        // Fallback to MOCK_EVENTS when offline or testing
        this.eventState.set(MOCK_EVENTS);
      },
    });
  }

  loadRegistrants(eventId: UUID): void {
    this.http
      .get<{ success: boolean; data: EventRegistrant[] }>(
        `${this.api}/registrations/event/${eventId}`,
      )
      .subscribe({
        next: (res) => {
          if (!res?.data || !Array.isArray(res.data)) return;
          this.registrantState.update((current) => {
            const others = current.filter((r) => r.event_id !== eventId);
            return [...others, ...res.data];
          });
        },
        error: () => {
          // Retain current registrants on offline/fallback
        },
      });
  }

  eventById(eventId: UUID): OrganizerEvent | undefined {
    return this.eventState().find((event) => event.id === eventId);
  }

  toggleCheckIn(registrantId: UUID): void {
    // 1. Optimistic UI update
    this.registrantState.update((registrants) =>
      registrants.map((registrant) => {
        if (registrant.id !== registrantId || registrant.status === 'Cancelled') {
          return registrant;
        }

        return {
          ...registrant,
          status: registrant.status === 'Checked In' ? 'Registered' : 'Checked In',
        };
      }),
    );

    // 2. Persist to backend database
    this.http
      .patch<{ success: boolean; data: EventRegistrant }>(
        `${this.api}/registrations/${registrantId}/toggle-check-in`,
        {},
      )
      .subscribe({
        next: (res) => {
          if (res?.data) {
            this.registrantState.update((registrants) =>
              registrants.map((r) => (r.id === registrantId ? res.data : r)),
            );
          }
        },
        error: () => {
          // If offline or testing with mock IDs, preserve optimistic state
        },
      });
  }
}
