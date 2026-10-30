import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EventRegistrant,
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

  readonly totalRegistrations = computed(() =>
    this.eventState().reduce((total, event) => total + event.registrations_count, 0),
  );

  private get api(): string {
    return `${environment.apiUrl}/events`;
  }

  loadEvents(): Observable<OrganizerEvent[]> {
    return this.http.get<ApiResponse<OrganizerEvent[]>>(`${this.api}/mine`).pipe(
      map((res) => res.data),
      tap({
        next: (events) => {
          this.eventState.set(events);
          this.eventsLoadedState.set(true);
        },
        error: () => this.eventsLoadedState.set(true),
      }),
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
