import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EventCheckpoint,
  EventOrganizer,
  EventStaff,
  EventLiveOverview,
  EventRegistrant,
  GuestFilePreview,
  EventRegistrantProgress,
  GuestImportMapping,
  NewOrganizerEvent,
  OrganizerCandidate,
  OrganizerEvent,
  OrganizerEventChanges,
  RecentScanItem,
  RecordScanResponse,
  UUID,
} from './organizer.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface GuestImportResult {
  created: Array<{
    id: string;
    email: string;
    fullName: string;
    ticketId: string;
    ticketCode: string;
    emailStatus: 'SENT' | 'FAILED';
  }>;
  skipped: Array<{ row: number; email?: string; reason: string }>;
  emailFailures: string[];
  summary: {
    created: number;
    skipped: number;
    emailFailures: number;
  };
  credentials?: Array<{ email: string; temporaryPassword: string }>;
}

@Injectable({ providedIn: 'root' })
export class OrganizerEventsService {
  private readonly http = inject(HttpClient);
  private readonly eventState = signal<OrganizerEvent[]>([]);
  private readonly registrantState = signal<EventRegistrant[]>([]);
  private readonly progressState = signal<Record<string, EventRegistrantProgress>>({});
  private readonly eventsLoadedState = signal(false);

  readonly events = this.eventState.asReadonly();
  readonly registrants = this.registrantState.asReadonly();
    /** Booth progress keyed by ticket id (same as EventRegistrant.id). */
  readonly progressByTicket = this.progressState.asReadonly();
  /** True once the organizer's events have been fetched at least once. */
  readonly eventsLoaded = this.eventsLoadedState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');

  readonly totalRegistrations = computed(() =>
    this.eventState().reduce((total, event) => total + event.registrations_count, 0),
  );

  private get api(): string {
    return `${environment.apiUrl}/events`;
  }

  loadEvents(): Observable<OrganizerEvent[]> {
    this.loading.set(true);
    this.error.set('');
    return this.http.get<ApiResponse<OrganizerEvent[]>>(`${this.api}/mine`).pipe(
      map((res) => res.data),
      tap({
        next: (events) => {
          this.eventState.set(events);
          this.eventsLoadedState.set(true);
        },
        error: (err: { error?: { message?: unknown } }) => {
          const message = err.error?.message;
          this.error.set(
            typeof message === 'string'
              ? message
              : 'Unable to load organizer events. Check the backend connection and try again.',
          );
          this.eventsLoadedState.set(true);
        },
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  loadRegistrants(eventId: UUID): Observable<EventRegistrant[]> {
    return this.http.get<ApiResponse<EventRegistrant[]>>(`${this.api}/${eventId}/registrants`).pipe(
      map((res) => res.data),
      tap((registrants) =>
        this.registrantState.update((current) => [
          ...current.filter((registrant) => registrant.event_id !== eventId),
          ...registrants,
        ]),
      ),
    );
  }

  loadProgress(eventId: UUID): Observable<EventRegistrantProgress[]> {
    return this.http
      .get<ApiResponse<EventRegistrantProgress[]>>(`${this.api}/${eventId}/progress`)
      .pipe(
        map((res) => res.data),
        tap((rows) =>
          this.progressState.update((current) => ({
            ...current,
            ...Object.fromEntries(rows.map((row) => [row.ticketId, row])),
          })),
        ),
      );
  }

  previewGuestFile(eventId: UUID, file: File): Observable<GuestFilePreview> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http
      .post<ApiResponse<GuestFilePreview>>(`${this.api}/${eventId}/guests/preview-file`, formData)
      .pipe(map((res) => res.data));
  }

  importGuestUsers(
    eventId: UUID,
    file: File,
    includeCredentials = false,
    mapping?: GuestImportMapping,
  ): Observable<GuestImportResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('includeCredentials', String(includeCredentials));
    if (mapping) {
      formData.append('mapping', JSON.stringify(mapping));
    }

    return this.http
      .post<ApiResponse<GuestImportResult>>(`${this.api}/${eventId}/guests/import-users`, formData)
      .pipe(
        map((res) => res.data),
        tap((result) =>
          this.eventState.update((events) =>
            events.map((event) =>
              event.id === eventId
                ? {
                    ...event,
                    registrations_count:
                      event.registrations_count + result.summary.created,
                  }
                : event,
            ),
          ),
        ),
      );
  }

  eventById(eventId: UUID): OrganizerEvent | undefined {
    return this.eventState().find((event) => event.id === eventId);
  }

  /** Submits a new event; the API stores it as pending admin approval. */
  createEvent(event: NewOrganizerEvent): Observable<OrganizerEvent> {
    return this.http.post<ApiResponse<OrganizerEvent>>(this.api, event).pipe(
      map((res) => res.data),
      tap((created) =>
        this.eventState.update((events) =>
          [...events, created].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
        ),
      ),
    );
  }

  updateEvent(eventId: UUID, changes: OrganizerEventChanges): Observable<OrganizerEvent> {
    return this.http.patch<ApiResponse<OrganizerEvent>>(`${this.api}/${eventId}`, changes).pipe(
      map((res) => res.data),
      tap((updated) =>
        this.eventState.update((events) =>
          events.map((event) => (event.id === eventId ? updated : event)),
        ),
      ),
    );
  }

   /** Soft-deletes the event on the server, then removes it from the local lists. */
  deleteEvent(eventId: UUID): Observable<void> {
    return this.http.delete<ApiResponse<unknown>>(`${this.api}/${eventId}`).pipe(
      tap(() => {
        this.eventState.update((events) => events.filter((event) => event.id !== eventId));
        this.registrantState.update((registrants) =>
          registrants.filter((registrant) => registrant.event_id !== eventId),
        );
      }),
      map(() => undefined),
    );
  }

  toggleCheckIn(registrant: EventRegistrant): Observable<EventRegistrant> {
    return this.http
      .patch<ApiResponse<EventRegistrant>>(
        `${this.api}/${registrant.event_id}/registrants/${registrant.id}/check-in`,
        {},
      )
      .pipe(
        map((res) => res.data),
        tap((updated) =>
          this.registrantState.update((registrants) =>
            registrants.map((current) => (current.id === updated.id ? updated : current)),
          ),
        ),
      );
  }

  cancelRegistrant(eventId: UUID, registrantId: UUID): Observable<EventRegistrant> {
    return this.http
      .patch<ApiResponse<EventRegistrant>>(
        `${this.api}/${eventId}/registrants/${registrantId}/cancel`,
        {},
      )
      .pipe(
        map((res) => res.data),
        tap((updated) =>
          this.registrantState.update((registrants) =>
            registrants.map((current) => (current.id === updated.id ? updated : current)),
          ),
        ),
      );
  }

  restoreRegistrant(eventId: UUID, registrantId: UUID): Observable<EventRegistrant> {
    return this.http
      .patch<ApiResponse<EventRegistrant>>(
        `${this.api}/${eventId}/registrants/${registrantId}/restore`,
        {},
      )
      .pipe(
        map((res) => res.data),
        tap((updated) =>
          this.registrantState.update((registrants) =>
            registrants.map((current) => (current.id === updated.id ? updated : current)),
          ),
        ),
      );
  }

  loadLiveOverview(eventId: UUID): Observable<EventLiveOverview> {
    return this.http
      .get<ApiResponse<EventLiveOverview>>(`${this.api}/${eventId}/live-overview`)
      .pipe(map((res) => res.data));
  }

  loadEventCheckpoints(eventId: UUID): Observable<EventCheckpoint[]> {
    return this.http
      .get<ApiResponse<EventCheckpoint[]>>(`${this.api}/${eventId}/checkpoints`)
      .pipe(map((res) => res.data));
  }

  recordScan(
    eventId: UUID,
    checkpointId: string,
    ticketCodeOrPayload: string | { ticketCode?: string; faceDescriptor?: number[] },
  ): Observable<RecordScanResponse> {
    const body =
      typeof ticketCodeOrPayload === 'string'
        ? { ticketCode: ticketCodeOrPayload }
        : ticketCodeOrPayload;
    return this.http
      .post<ApiResponse<RecordScanResponse>>(
        `${this.api}/${eventId}/checkpoints/${checkpointId}/scan`,
        body,
      )
      .pipe(map((res) => res.data));
  }

  /** Scan log for the Stream tab, newest first. */
  listScans(
    eventId: UUID,
    filters: { stationId?: string; status?: string; limit?: number } = {},
  ): Observable<RecentScanItem[]> {
    const params: Record<string, string> = {};
    if (filters.stationId) params['stationId'] = filters.stationId;
    if (filters.status) params['status'] = filters.status;
    if (filters.limit) params['limit'] = String(filters.limit);
    return this.http
      .get<ApiResponse<RecentScanItem[]>>(`${this.api}/${eventId}/scans`, { params })
      .pipe(map((res) => res.data));
  }

  exportScansCsv(eventId: UUID): Observable<string> {
    return this.http
      .get<ApiResponse<string>>(`${this.api}/${eventId}/scans/export`)
      .pipe(map((res) => res.data));
  }

  loadStaff(eventId: UUID): Observable<EventStaff[]> {
    return this.http
      .get<ApiResponse<EventStaff[]>>(`${this.api}/${eventId}/staff`)
      .pipe(map((res) => res.data));
  }

  addStaff(eventId: UUID, email: string): Observable<EventStaff> {
    return this.http
      .post<ApiResponse<EventStaff>>(`${this.api}/${eventId}/staff`, { email })
      .pipe(map((res) => res.data));
  }

  removeStaff(eventId: UUID, userId: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(`${this.api}/${eventId}/staff/${userId}`)
      .pipe(map(() => undefined));
  }

  loadOrganizers(eventId: UUID): Observable<EventOrganizer[]> {
    return this.http
      .get<ApiResponse<EventOrganizer[]>>(`${this.api}/${eventId}/organizers`)
      .pipe(map((res) => res.data));
  }

  addOrganizer(eventId: UUID, email: string): Observable<EventOrganizer> {
    return this.http
      .post<ApiResponse<EventOrganizer>>(`${this.api}/${eventId}/organizers`, { email })
      .pipe(map((res) => res.data));
  }

  removeOrganizer(eventId: UUID, userId: string): Observable<void> {
    return this.http
      .delete<ApiResponse<unknown>>(`${this.api}/${eventId}/organizers/${userId}`)
      .pipe(map(() => undefined));
  }

  searchOrganizerCandidates(query: string): Observable<OrganizerCandidate[]> {
    return this.http
      .get<ApiResponse<OrganizerCandidate[]>>(`${this.api}/organizers/candidates`, {
        params: { query },
      })
      .pipe(map((res) => res.data));
  }

}