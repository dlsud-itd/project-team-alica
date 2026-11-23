import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TicketProgress } from './attendee-progress.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/** Loads and caches booth stamp-card progress per ticket code. */
@Injectable({ providedIn: 'root' })
export class AttendeeProgressService {
  private readonly http = inject(HttpClient);
  private readonly cache = signal<Record<string, TicketProgress>>({});

  /** Progress keyed by ticket code; updated by every successful load. */
  readonly byTicket = this.cache.asReadonly();

  loadProgress(ticketCode: string): Observable<TicketProgress> {
    const url = `${environment.apiUrl}/registrations/${encodeURIComponent(ticketCode)}/progress`;
    return this.http.get<ApiResponse<TicketProgress>>(url).pipe(
      map((res) => res.data),
      tap((progress) =>
        this.cache.update((current) => ({ ...current, [ticketCode]: progress })),
      ),
    );
  }

  /** Loads per-user progress for a specific event (or null if not registered). */
  loadMyProgressForEvent(eventIdOrSlug: string): Observable<TicketProgress | null> {
    const url = `${environment.apiUrl}/registrations/event/${encodeURIComponent(eventIdOrSlug)}/progress`;
    return this.http.get<ApiResponse<TicketProgress | null>>(url).pipe(
      map((res) => res.data),
      tap((progress) => {
        if (progress?.ticketCode) {
          this.cache.update((current) => ({ ...current, [progress.ticketCode]: progress }));
        }
      }),
    );
  }
}
