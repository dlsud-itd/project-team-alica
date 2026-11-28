export type RsvpCategory = string;
export type RsvpStatus = 'Registered' | 'Checked In' | 'Cancelled';

export interface AttendeeRsvp {
  ticketId: string;
  ticketCode: string;
  qrPayload: string;
  ticketType: string;
  status: RsvpStatus;
  registeredAt: string;
  firstScannedAt: string | null;
  eventId: string;
  eventName: string;
  eventSlug: string;
  venue: string;
  startsAt: string;
  endsAt: string;
  category: RsvpCategory;
  categoryLabel: string;
  tags?: string[];
  description: string;
}
