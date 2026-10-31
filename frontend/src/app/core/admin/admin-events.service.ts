import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UUID } from '../organizer/organizer.models';
import { AdminEvent, EventReview } from './admin.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AdminEventsService {
  private readonly http = inject(HttpClient);
  private readonly eventState = signal<AdminEvent[]>([]);
  private readonly eventsLoadedState = signal(false);

  readonly events = this.eventState.asReadonly();
  /** True once the events have been fetched at least once. */
  readonly eventsLoaded = this.eventsLoadedState.asReadonly();

  readonly pendingCount = computed(
    () => this.eventState().filter((event) => event.approval_status === 'Pending').length,
  );

  private get api(): string {
    return `${environment.apiUrl}/events`;
  }

  loadEvents(): Observable<AdminEvent[]> {
    return this.http.get<ApiResponse<AdminEvent[]>>(`${this.api}/admin`).pipe(
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

  reviewEvent(eventId: UUID, review: EventReview): Observable<AdminEvent> {
    return this.http
      .patch<ApiResponse<AdminEvent>>(`${this.api}/${eventId}/review`, review)
      .pipe(
        map((res) => res.data),
        tap((updated) =>
          this.eventState.update((events) =>
            events.map((event) => (event.id === eventId ? updated : event)),
          ),
        ),
      );
  }
}
