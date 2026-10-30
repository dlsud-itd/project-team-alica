import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';

export interface EventCardData {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  categoryLabel: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  spotsTotal: number;
  spotsTaken: number;
  status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON';
  statusLabel: string;
  organizerName: string;
  organizerId?: string;
  staffIds?: string[];
  registeredUserIds?: string[];
}

export type CategoryFilter =
  | 'ALL'
  | 'MY_EVENTS'
  | 'TODAY'
  | 'CONFERENCE'
  | 'HACKATHON'
  | 'WORKSHOP'
  | 'EXPO';

export type EventRoleStatus =
  | 'ORGANIZER'
  | 'STAFF'
  | 'REGISTERED'
  | 'ADMIN'
  | 'NONE';

const CACHE_KEY = 'checkpoint_events_cache';
const CACHE_TIME_KEY = 'checkpoint_events_cache_time';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes SWR TTL for free-tier efficiency

@Component({
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  selector: 'app-events',
  styleUrl: './events.component.scss',
  templateUrl: './events.component.html',
})
export class Events implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<CategoryFilter>('ALL');

  readonly events = signal<EventCardData[]>([]);

  ngOnInit(): void {
    this.loadEventsWithCache();
  }

  /**
   * Stale-While-Revalidate (SWR) Event Loader:
   * 1. Render from localStorage cache immediately if available (0ms).
   * 2. If cache is missing or older than 5 minutes, fetch from API in background.
   */
  private loadEventsWithCache(): void {
    const cached = this.getCachedEvents();
    if (cached) {
      this.events.set(cached.events);
      const isFresh = Date.now() - cached.timestamp < CACHE_TTL_MS;
      if (isFresh) {
        return; // Cache is still fresh; zero unnecessary DB calls
      }
    }

    this.http
      .get<{ success: boolean; data: EventCardData[] }>(
        `${environment.apiUrl}/events`,
      )
      .subscribe({
        next: (res) => {
          if (res?.success && Array.isArray(res.data)) {
            this.events.set(res.data);
            this.setCachedEvents(res.data);
          }
        },
        error: () => {
          // Keep showing cached events (if any) while the backend is unreachable
        },
      });
  }

  private getCachedEvents(): { events: EventCardData[]; timestamp: number } | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const timeRaw = localStorage.getItem(CACHE_TIME_KEY);
      if (raw && timeRaw) {
        const events = JSON.parse(raw) as EventCardData[];
        const timestamp = parseInt(timeRaw, 10);
        return { events, timestamp };
      }
    } catch {}
    return null;
  }

  private setCachedEvents(events: EventCardData[]): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(events));
      localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch {}
  }

  /** Determine the active authenticated user's contextual role for a given event. */
  getEventRole(event: EventCardData): EventRoleStatus {
    const user = this.auth.user();
    if (!user) return 'NONE';

    // System Admins possess universal event management
    if (user.role === 'ADMIN') {
      return 'ADMIN';
    }

    // Event organizer (created/managed by user)
    if (event.organizerId === user.id) {
      return 'ORGANIZER';
    }

    // Assigned Checkpoint / Event staff
    if (event.staffIds?.includes(user.id)) {
      return 'STAFF';
    }

    // Registered attendee with an active ticket pass
    if (event.registeredUserIds?.includes(user.id)) {
      return 'REGISTERED';
    }

    return 'NONE';
  }

  // Reactive Category Filter & Search
  readonly filteredEvents = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const cat = this.selectedCategory();

    return this.events().filter((event) => {
      const matchesCategory =
        cat === 'ALL'
          ? true
          : cat === 'MY_EVENTS'
            ? this.getEventRole(event) !== 'NONE'
            : cat === 'TODAY'
              ? event.status === 'LIVE_TODAY'
              : event.category === cat;

      const matchesQuery =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.organizerName.toLowerCase().includes(query);

      return matchesCategory && matchesQuery;
    });
  });

  // Modal State
  readonly activeRsvpEvent = signal<EventCardData | null>(null);
  readonly isSubmitting = signal(false);
  readonly rsvpError = signal('');
  readonly rsvpSuccess = signal<{ ticketCode: string; attendeeName: string } | null>(null);
  readonly copyFeedback = signal(false);

  readonly rsvpForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    studentId: ['', [Validators.required]],
  });

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
  }

  setCategory(category: CategoryFilter): void {
    this.selectedCategory.set(category);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('ALL');
  }

  openRsvp(event: EventCardData): void {
    this.activeRsvpEvent.set(event);
    this.rsvpSuccess.set(null);
    this.rsvpError.set('');
    this.copyFeedback.set(false);

    // Pre-populate if user is already authenticated
    const user = this.auth.user();
    if (user) {
      this.rsvpForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        studentId: '',
      });
    } else {
      this.rsvpForm.reset({
        fullName: '',
        email: '',
        studentId: '',
      });
    }
  }

  closeModal(): void {
    this.activeRsvpEvent.set(null);
    this.rsvpSuccess.set(null);
  }

  submitRsvp(): void {
    if (this.rsvpForm.invalid) {
      this.rsvpForm.markAllAsTouched();
      return;
    }

    const currentEvent = this.activeRsvpEvent();
    if (!currentEvent) return;

    this.isSubmitting.set(true);
    this.rsvpError.set('');

    const formVal = this.rsvpForm.getRawValue();
    const currentUser = this.auth.user();

    const payload = {
      eventId: currentEvent.id,
      fullName: formVal.fullName,
      email: formVal.email,
      studentId: formVal.studentId,
      userId: currentUser?.id,
    };

    this.http
      .post<{
        success: boolean;
        data: {
          ticketCode: string;
          qrPayload: string;
          attendeeName: string;
          eventId: string;
        };
      }>(`${environment.apiUrl}/registrations`, payload)
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.handleRsvpSuccess(
            currentEvent,
            res.data.ticketCode,
            res.data.attendeeName,
            currentUser?.id,
          );
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting.set(false);
          this.rsvpError.set(
            err.error?.message ?? 'Could not complete your RSVP. Please try again.',
          );
        },
      });
  }

  private handleRsvpSuccess(
    event: EventCardData,
    ticketCode: string,
    attendeeName: string,
    userId: string | undefined,
  ): void {
    this.rsvpSuccess.set({
      ticketCode,
      attendeeName,
    });

    // Reflect the new registration on the card until the next refresh from the API
    this.events.update((list) => {
      const updated = list.map((ev) =>
        ev.id === event.id
          ? {
              ...ev,
              spotsTaken: Math.min(ev.spotsTotal, ev.spotsTaken + 1),
              registeredUserIds: userId
                ? Array.from(new Set([...(ev.registeredUserIds ?? []), userId]))
                : ev.registeredUserIds,
            }
          : ev,
      );
      this.setCachedEvents(updated);
      return updated;
    });
  }

  copyTicketCode(): void {
    const code = this.rsvpSuccess()?.ticketCode;
    if (code) {
      navigator.clipboard?.writeText(code);
      this.copyFeedback.set(true);
      setTimeout(() => this.copyFeedback.set(false), 2000);
    }
  }
}
