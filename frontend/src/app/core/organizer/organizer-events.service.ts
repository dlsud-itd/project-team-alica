import { Injectable, computed, signal } from '@angular/core';
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
  private readonly eventState = signal<OrganizerEvent[]>(MOCK_EVENTS);
  private readonly registrantState = signal<EventRegistrant[]>(MOCK_REGISTRANTS);

  readonly events = this.eventState.asReadonly();
  readonly registrants = this.registrantState.asReadonly();

  readonly totalRegistrations = computed(() =>
    this.eventState().reduce((total, event) => total + event.registrations_count, 0),
  );

  eventById(eventId: UUID): OrganizerEvent | undefined {
    return this.eventState().find((event) => event.id === eventId);
  }

  toggleCheckIn(registrantId: UUID): void {
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
  }
}
