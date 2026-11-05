import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import type { ScannerApi } from './scanner-api';
import { ScanOutcome, ScanRequest, ScanResult, StaffCheckpoint } from './scanner.models';

interface MockTicket {
  ticketCode: string;
  eventId: string;
  fullName: string;
  studentId: string | null;
  ticketType: string;
  cancelled?: boolean;
}

interface MockLog {
  ticketCode: string;
  checkpointId: string;
  scannedAt: string;
  scanResult: ScanResult;
}

const TECH_SUMMIT = { eventId: 'evt-tech-summit-2026', eventName: 'DLSU-D Tech Summit 2026' };

// Same checkpoints as backend/prisma/seed.sql. The seed only assigns the staff
// account to the main gate; all three are returned here so the station
// switcher and each checkpoint rule can be exercised.
const CHECKPOINTS: StaffCheckpoint[] = [
  {
    id: 'chk-main-gate',
    name: 'Main Gate Turnstile A',
    location: 'East Entrance Gates',
    type: 'MAIN_ENTRY',
    allowMultipleScans: false,
    requireMainEntry: false,
    ...TECH_SUMMIT,
  },
  {
    id: 'chk-session-keynote',
    name: 'Plenary Hall - AI Keynote',
    location: '2nd Floor Main Plenary',
    type: 'SESSION',
    allowMultipleScans: false,
    requireMainEntry: true,
    ...TECH_SUMMIT,
  },
  {
    id: 'chk-booth-showcase',
    name: 'Capstone Project Showcase Area',
    location: 'Ground Floor Atrium',
    type: 'BOOTH',
    allowMultipleScans: true,
    requireMainEntry: false,
    ...TECH_SUMMIT,
  },
];

const TICKETS: MockTicket[] = [
  {
    ticketCode: 'CHK-2026-9812A',
    eventId: 'evt-tech-summit-2026',
    fullName: 'Alen Mikel Umandal',
    studentId: '2023-01982-MN-0',
    ticketType: 'STUDENT',
  },
  {
    ticketCode: 'CHK-2026-4417A',
    eventId: 'evt-tech-summit-2026',
    fullName: 'Maria Santos',
    studentId: '2022-04417-MN-0',
    ticketType: 'STUDENT',
  },
  {
    ticketCode: 'CHK-2026-7350A',
    eventId: 'evt-tech-summit-2026',
    fullName: 'Dr. Ramon Cruz',
    studentId: null,
    ticketType: 'SPEAKER',
  },
  {
    ticketCode: 'CHK-2026-1203A',
    eventId: 'evt-tech-summit-2026',
    fullName: 'Paolo Reyes',
    studentId: '2024-01203-MN-0',
    ticketType: 'STUDENT',
    cancelled: true,
  },
  {
    ticketCode: 'CHK-2026-5521A',
    eventId: 'evt-ai-hackathon-2026',
    fullName: 'Jessa Villanueva',
    studentId: '2023-05521-MN-0',
    ticketType: 'STUDENT',
  },
];

/** In-memory stand-in for the checkpoint scan API. State resets on reload. */
@Injectable({ providedIn: 'root' })
export class MockScannerApi implements ScannerApi {
  private readonly logs: MockLog[] = [];
  private readonly latencyMs = 350;

  getMyCheckpoints(): Observable<StaffCheckpoint[]> {
    return of(CHECKPOINTS.map((c) => ({ ...c }))).pipe(delay(this.latencyMs));
  }

  scan(checkpointId: string, request: ScanRequest): Observable<ScanOutcome> {
    return of(this.evaluate(checkpointId, request)).pipe(delay(this.latencyMs));
  }

  private evaluate(checkpointId: string, request: ScanRequest): ScanOutcome {
    const checkpoint = CHECKPOINTS.find((c) => c.id === checkpointId);
    if (!checkpoint) {
      throw new Error(`Unknown checkpoint '${checkpointId}'`);
    }

    const code = request.ticketCode.trim().toUpperCase();
    const ticket = TICKETS.find((t) => t.ticketCode === code);
    const scannedAt = new Date().toISOString();
    const base = {
      scannedAt,
      firstScannedAt: null,
      checkpoint: { id: checkpoint.id, name: checkpoint.name, type: checkpoint.type },
    };

    if (!ticket || ticket.eventId !== checkpoint.eventId) {
      return {
        ...base,
        scanResult: 'INVALID_TICKET',
        message: 'Ticket code does not exist or is not valid for this event.',
        attendee: null,
      };
    }

    const attendee = {
      fullName: ticket.fullName,
      studentId: ticket.studentId,
      ticketType: ticket.ticketType,
      ticketCode: ticket.ticketCode,
    };

    if (ticket.cancelled) {
      return {
        ...base,
        scanResult: 'INVALID_TICKET',
        message: 'This registration was cancelled.',
        attendee,
      };
    }

    const passed = (cpId: string) =>
      this.logs.find(
        (l) => l.ticketCode === code && l.checkpointId === cpId && l.scanResult === 'SUCCESS',
      );

    const previous = passed(checkpoint.id);
    if (previous && !checkpoint.allowMultipleScans) {
      this.record(code, checkpoint.id, scannedAt, 'DUPLICATE');
      return {
        ...base,
        scanResult: 'DUPLICATE',
        message: 'Attendee has already checked in at this checkpoint.',
        firstScannedAt: previous.scannedAt,
        attendee,
      };
    }

    const mainEntryIds = CHECKPOINTS.filter(
      (c) => c.eventId === checkpoint.eventId && c.type === 'MAIN_ENTRY',
    ).map((c) => c.id);
    const hasMainEntry = mainEntryIds.some((id) => passed(id));

    if (checkpoint.requireMainEntry && !hasMainEntry) {
      this.record(code, checkpoint.id, scannedAt, 'WARNING_NO_MAIN_ENTRY');
      return {
        ...base,
        scanResult: 'WARNING_NO_MAIN_ENTRY',
        message: 'Attendee has not passed the main entrance.',
        attendee,
      };
    }

    this.record(code, checkpoint.id, scannedAt, 'SUCCESS');
    return { ...base, scanResult: 'SUCCESS', message: 'Check-in successful', attendee };
  }

  private record(
    ticketCode: string,
    checkpointId: string,
    scannedAt: string,
    scanResult: ScanResult,
  ) {
    this.logs.push({ ticketCode, checkpointId, scannedAt, scanResult });
  }
}
