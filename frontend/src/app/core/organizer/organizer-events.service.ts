import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, finalize, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EventRegistrant,
  NewOrganizerEvent,
  OrganizerEvent,
  OrganizerEventChanges,
  UUID,
} from './organizer.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class OrganizerEventsService {
  private readonly http = inject(HttpClient);
  private readonly eventState = signal<OrganizerEvent[]>([]);
  private readonly registrantState = signal<EventRegistrant[]>([]);
  private readonly eventsLoadedState = signal(false);

  readonly events = this.eventState.asReadonly();
  readonly registrants = this.registrantState.asReadonly();
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
    return this.http
      .get<ApiResponse<EventRegistrant[]>>(`${this.api}/${eventId}/registrants`)
      .pipe(
        map((res) => res.data),
        tap((registrants) =>
          this.registrantState.update((current) => [
            ...current.filter((registrant) => registrant.event_id !== eventId),
            ...registrants,
          ]),
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

  // Local only for now: there is no delete endpoint yet, so the event returns on the next load.
  deleteEvent(eventId: UUID): void {
    this.eventState.update((events) => events.filter((event) => event.id !== eventId));
    this.registrantState.update((registrants) =>
      registrants.filter((registrant) => registrant.event_id !== eventId),
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
}
