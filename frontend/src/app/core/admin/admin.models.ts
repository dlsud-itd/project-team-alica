import { OrganizerEvent } from '../organizer/organizer.models';

export interface AdminEvent extends OrganizerEvent {
  organizer_name: string;
  organizer_email: string;
}

export type ReviewDecision = 'APPROVED' | 'REJECTED';

export interface EventReview {
  decision: ReviewDecision;
  /** Required by the API when rejecting, so the organizer knows what to fix. */
  notes?: string;
}
