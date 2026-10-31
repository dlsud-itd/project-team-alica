export type UUID = string;

export type RegistrationStatus = 'Registered' | 'Checked In' | 'Cancelled';

export type EventStatus = 'Upcoming' | 'In progress' | 'Completed';

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

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
  description: string;
  allow_walk_ins: boolean;
  /** New events stay `Pending` (hidden from attendees) until an admin reviews them. */
  approval_status: ApprovalStatus;
  /** Admin feedback, set when an event is rejected. */
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string;
}

type EditableEventFields =
  | 'name'
  | 'description'
  | 'venue'
  | 'starts_at'
  | 'ends_at'
  | 'capacity'
  | 'allow_walk_ins';

export type OrganizerEventChanges = Partial<Pick<OrganizerEvent, EditableEventFields>>;

export type NewOrganizerEvent = Pick<OrganizerEvent, EditableEventFields> & { capacity: number };

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
