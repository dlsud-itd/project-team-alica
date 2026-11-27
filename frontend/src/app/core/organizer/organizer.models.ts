import { ProgressSummary } from '../attendee/attendee-progress.models';
import { TicketProgress } from '../attendee/attendee-progress.models';

export type UUID = string;

export type RegistrationStatus = 'Registered' | 'Checked In' | 'Cancelled';

export type EventStatus = 'Upcoming' | 'In progress' | 'Completed';

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface EventScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
  /** BOOTH and GATE are legacy values from before the program was split from stations. */
  type: 'KEYNOTE' | 'SESSION' | 'WORKSHOP' | 'PANEL' | 'BREAK' | 'OTHER' | 'BOOTH' | 'GATE' | string;
  location?: string;
  /** Optional station where attendance for this program item is scanned. */
  checkpointId?: string;
}

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
  require_student_id?: boolean;
  /** New events stay `Pending` (hidden from attendees) until an admin reviews them. */
  approval_status: ApprovalStatus;
  /** Admin feedback, set when an event is rejected. */
  review_notes: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  category?: string;
  category_label?: string;
  tags?: string[];
  checkpoints_count?: number;
  admitted_count?: number;
  is_private?: boolean;
  banner_image_url?: string | null;
  speakers?: WizardSpeaker[];
  schedule?: EventScheduleItem[];
  organizers?: EventOrganizer[];
}

export interface EventLiveKpis {
  totalRsvps: number;
  checkedInAttendees: number;
  attendanceRate: number;
  venueOccupancy: number;
  maxCapacity: number | null;
  activeStationsCount: number;
  totalVerifiedScans: number;
}

export interface HourlyFlowPoint {
  hour: string;
  scans: number;
}

export interface StationTraffic {
  id: string;
  name: string;
  type: string;
  scans: number;
  percentage: number;
}

export interface RecentScanItem {
  id: string;
  attendeeName: string;
  affiliation: string;
  ticketCode: string;
  /** Checkpoint id (present on API responses since the Stream tab). */
  stationId?: string;
  stationName: string;
  scannedAt: string;
  status: string;
  statusLabel: string;
}

export interface EventLiveOverview {
  id: string;
  organizerId?: string;
  name: string;
  slug: string;
  category: string;
  categoryLabel: string;
  capacity: number | null;
  venue: string;
  startsAt: string;
  endsAt: string;
  kpis: EventLiveKpis;
  hourlyFlow: HourlyFlowPoint[];
  stationTraffic: StationTraffic[];
  recentScans: RecentScanItem[];
  organizers?: EventOrganizer[];
}

export interface EventCheckpoint {
  id: string;
  name: string;
  location: string | null;
  type: string;
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  cooldownSeconds?: number;
  eventId: string;
  eventName: string;
  parentId?: string | null;
}

export interface EventOrganizer {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  affiliation: string | null;
  assignedAt: string;
  isPrimary: boolean;
}

export interface OrganizerCandidate {
  id: string;
  email: string;
  fullName: string;
  affiliation: string | null;
}

export type StaffAccessLevel = 'ALL_SCANNERS' | 'SPECIFIC_BOOTH';

export interface EventStaff {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  affiliation: string | null;
  assignedAt: string;
  accessLevel?: StaffAccessLevel;
  checkpointId?: string | null;
  checkpointName?: string | null;
}

export interface WizardEntrance {
  id?: string;
  name: string;
  location?: string;
  allowMultipleScans?: boolean;
}

export interface WizardBooth {
  id?: string;
  name: string;
  location?: string;
  allowMultipleScans?: boolean;
  requireMainEntry?: boolean;
}

export interface WizardSpeaker {
  id?: string;
  name: string;
  role?: string;
  company?: string;
  topic?: string;
  avatarUrl?: string;
}

export interface WizardStaffAssignment {
  email: string;
  accessLevel: StaffAccessLevel;
  checkpointName?: string;
}

export interface RecordScanResponse {
  scanResult: 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';
  ticketCode: string;
  attendeeName?: string;
  affiliation?: string;
  stationName?: string;
  scannedAt: string;
  firstScannedAt?: string | null;
  message: string;
  cooldownActive?: boolean;
  cooldownSeconds?: number;
  cooldownRemainingSeconds?: number;
  /** Attendee's booth stamp progress (SUCCESS/DUPLICATE scans only). */
  progress?: ProgressSummary;
  verificationMethod?: 'QR' | 'FACE_ID';
  faceConfidence?: number;
}

type EditableEventFields =
  | 'name'
  | 'description'
  | 'venue'
  | 'starts_at'
  | 'ends_at'
  | 'capacity'
  | 'allow_walk_ins'
  | 'require_student_id'
  | 'is_private'
  | 'category'
  | 'tags'
  | 'banner_image_url';

export type OrganizerEventChanges = Partial<Pick<OrganizerEvent, EditableEventFields>> & {
  schedule?: EventScheduleItem[];
  organizerEmails?: string[];
};

export type NewOrganizerEvent = Pick<OrganizerEvent, 'name' | 'venue' | 'starts_at' | 'ends_at'> &
  Partial<Pick<OrganizerEvent, EditableEventFields>> & {
    capacity: number;
    schedule?: EventScheduleItem[];
    organizerEmails?: string[];
    entrances?: WizardEntrance[];
    booths?: WizardBooth[];
    staffAssignments?: WizardStaffAssignment[];
    speakers?: WizardSpeaker[];
  };

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

export interface GuestFilePreview {
  fileName: string;
  totalRows: number;
  detectedHeaders: string[];
  sampleRows: string[][];
}

export interface GuestImportMapping {
  hasHeaders?: boolean;
  nameMode?: 'single' | 'split';
  fullNameColumn?: string | number;
  firstNameColumn?: string | number;
  lastNameColumn?: string | number;
  emailColumn: string | number;
  studentIdColumn?: string | number;
  contactNumberColumn?: string | number;
  affiliationColumn?: string | number;
}

/** One row of GET /events/:eventId/progress. */
export interface EventRegistrantProgress extends TicketProgress {
  /** Same as EventRegistrant.id */
  ticketId: string;
}
