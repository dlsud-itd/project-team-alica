// Mirrors the Prisma enums in backend/prisma/schema.prisma.
export type CheckpointType = 'MAIN_ENTRY' | 'SESSION' | 'BOOTH' | 'EXIT';
export type ScanResult = 'SUCCESS' | 'DUPLICATE' | 'WARNING_NO_MAIN_ENTRY' | 'INVALID_TICKET';

/** A checkpoint the signed-in staff member is assigned to (checkpoint_staff). */
export interface StaffCheckpoint {
  parentId?: string | null;
  id: string;
  name: string;
  location: string | null;
  type: CheckpointType;
  allowMultipleScans: boolean;
  requireMainEntry: boolean;
  eventId: string;
  eventName: string;
}

export interface ScanRequest {
  ticketCode: string;
  deviceInfo?: string;
  notes?: string;
}

export interface ScanAttendee {
  fullName: string;
  studentId: string | null;
  ticketType: string;
  ticketCode: string;
}

/**
 * Normalized result of POST /checkpoints/:id/scan. The API answers DUPLICATE
 * with 409 and INVALID_TICKET with 404; both are mapped into this shape.
 */
export interface ScanOutcome {
  scanResult: ScanResult;
  message: string;
  scannedAt: string;
  /** First successful scan at this checkpoint, set for DUPLICATE results. */
  firstScannedAt: string | null;
  checkpoint: Pick<StaffCheckpoint, 'id' | 'name' | 'type'>;
  attendee: ScanAttendee | null;
}
