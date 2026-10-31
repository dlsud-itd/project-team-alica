import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';
import { EventRegistrant, OrganizerEvent, UUID } from './organizer.models';

interface OrganizerDashboardResponse {
  success: boolean;
  data: {
    events: OrganizerEvent[];
    registrants: EventRegistrant[];
  };
}

@Injectable({ providedIn: 'root' })
export class OrganizerEventsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly eventState = signal<OrganizerEvent[]>([]);
  private readonly registrantState = signal<EventRegistrant[]>([]);

  readonly events = this.eventState.asReadonly();
  readonly registrants = this.registrantState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');

  readonly totalRegistrations = computed(() =>
    this.eventState().reduce((total, event) => total + event.registrations_count, 0),
  );

  constructor() {
    this.load();
  }

  load(): void {
    const token = this.auth.token();
    if (!token) {
      this.error.set('Sign in with an organizer account to load your events.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.http
      .get<OrganizerDashboardResponse>(`${environment.apiUrl}/events/organizer`, {
        headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
      })
      .subscribe({
        next: ({ data }) => {
          this.eventState.set(data.events);
          this.registrantState.set(data.registrants);
          this.loading.set(false);
        },
        error: (err: { error?: { message?: unknown } }) => {
          const message = err.error?.message;
          this.error.set(
            typeof message === 'string'
              ? message
              : 'Unable to load organizer events. Check the backend connection and try again.',
          );
          this.loading.set(false);
        },
      });
  }

  eventById(eventId: UUID): OrganizerEvent | undefined {
    return this.eventState().find((event) => event.id === eventId);
  }

  updateEvent(eventId: UUID, changes: Partial<OrganizerEvent>): void {
    this.eventState.update((events) =>
      events.map((event) => (event.id === eventId ? { ...event, ...changes } : event)),
    );
  }

  deleteEvent(eventId: UUID): void {
    this.eventState.update((events) => events.filter((event) => event.id !== eventId));
    this.registrantState.update((registrants) =>
      registrants.filter((registrant) => registrant.event_id !== eventId),
    );
  }

  toggleCheckIn(registrantId: UUID): void {
    this.registrantState.update((registrants) =>
      registrants.map((registrant) => {
        if (registrant.id !== registrantId || registrant.status === 'Cancelled') {
          return registrant;
        }

        return {
          ...registrant,
          status: registrant.status === 'Checked In' ? 'Registered' : 'Checked In',
        };
      }),
    );
  }
}