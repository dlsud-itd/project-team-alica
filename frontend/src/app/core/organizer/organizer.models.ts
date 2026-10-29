export type UUID = string;

export type RegistrationStatus = 'Registered' | 'Checked In' | 'Cancelled';

export interface OrganizerEvent {
  id: UUID;
  organizer_id: UUID;
  name: string;
  starts_at: string;
  ends_at: string;
  venue: string;
  city: string;
  registrations_count: number;
  capacity: number;
  status: 'Upcoming' | 'In progress' | 'Completed';
}

export interface EventRegistrant {
  id: UUID;
  event_id: UUID;
  attendee_id: UUID;
  full_name: string;
  email: string;
  ticket_id: string;
  registered_at: string;
  status: RegistrationStatus;
}
