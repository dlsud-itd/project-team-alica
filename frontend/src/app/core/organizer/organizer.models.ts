export type UUID = string;

export type RegistrationStatus = 'Registered' | 'Checked In' | 'Cancelled';

export type EventStatus = 'Upcoming' | 'In progress' | 'Completed';

export interface OrganizerEvent {
  id: UUID;
  organizer_id: UUID;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  registrations_count: number;
  /** `null` when the event has no capacity limit. */
  capacity: number | null;
  /** Derived by the API from the event's start and end dates. */
  status: EventStatus;
}

export type OrganizerEventChanges = Partial<
  Pick<OrganizerEvent, 'name' | 'venue' | 'starts_at' | 'ends_at' | 'capacity'>
>;

export interface EventRegistrant {
  id: UUID;
  event_id: UUID;
  attendee_id: UUID | null;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: RegistrationStatus;
}
