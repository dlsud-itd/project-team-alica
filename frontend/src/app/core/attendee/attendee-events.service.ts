import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { NewOrganizerEvent, OrganizerEvent } from '../organizer/organizer.models';

/** Lets an attendee submit an event for admin review and track its status. */
@Injectable({ providedIn: 'root' })
export class AttendeeEventsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  private readonly submittedState = signal<OrganizerEvent[]>([]);
  readonly submitted = this.submittedState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');

  /** Events this user created (with approval status and admin notes). */
  loadSubmitted(): Observable<OrganizerEvent[]> {
    this.loading.set(true);
    this.error.set('');
    return this.http
      .get<{ success: boolean; data: OrganizerEvent[] }>(`${this.apiUrl}/events/mine`, {
        headers: this.buildHeaders(),
      })
      .pipe(
        map((res) => res.data),
        tap({
          next: (events) => {
            this.submittedState.set(events);
            this.loading.set(false);
          },
          error: () => {
            this.error.set('Could not load your submitted events.');
            this.loading.set(false);
          },
        }),
      );
  }

  /** Submit a new event. The backend saves it as Pending until an admin reviews it. */
  submit(payload: NewOrganizerEvent): Observable<OrganizerEvent> {
    return this.http
      .post<{ success: boolean; data: OrganizerEvent }>(`${this.apiUrl}/events`, payload, {
        headers: this.buildHeaders(),
      })
      .pipe(
        map((res) => res.data),
        tap((created) => this.submittedState.update((list) => [created, ...list])),
      );
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.auth.token();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }
}