import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../../core/auth/auth.service';
import { SavedProfile } from '../../../core/auth/auth.models';
import { environment } from '../../../../environments/environment';

export interface EventCardData {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  tags?: string[];
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

export type CategoryFilter = 'ALL' | 'MY_EVENTS' | 'TODAY' | string;

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
    if (cached && Array.isArray(cached.events) && cached.events.length > 0) {
      this.events.set(cached.events);
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

  readonly availableCategories = computed(() => {
    const defaultSet = ['Conference', 'Hackathon', 'Workshop', 'Expo / Showcase'];
    const fromEvents = this.events()
      .map((e) => e.categoryLabel || e.category)
      .filter((c): c is string => Boolean(c && c.trim()));
    return Array.from(new Set([...defaultSet, ...fromEvents]));
  });

  filterByTag(tag: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    this.searchQuery.set(tag);
    this.currentPage.set(1);
  }

  // Pagination State
  readonly pageSize = 6;
  readonly currentPage = signal(1);

  readonly totalPages = computed(() =>
    Math.max(Math.ceil(this.filteredEvents().length / this.pageSize), 1),
  );

  readonly paginatedEvents = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredEvents().slice(start, start + this.pageSize);
  });

  readonly startIndex = computed(() =>
    this.filteredEvents().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize + 1,
  );

  readonly endIndex = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.filteredEvents().length),
  );

  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (current <= 4) {
      for (let i = 1; i <= 5; i++) pages.push(i);
      pages.push('...');
      pages.push(total);
    } else if (current >= total - 3) {
      pages.push(1);
      pages.push('...');
      for (let i = total - 4; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      pages.push('...');
      pages.push(current - 1);
      pages.push(current);
      pages.push(current + 1);
      pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  goToPage(page: number | string): void {
    if (typeof page !== 'number') return;
    if (page >= 1 && page <= this.totalPages() && page !== this.currentPage()) {
      this.currentPage.set(page);
      this.scrollToTop();
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.scrollToTop();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.scrollToTop();
    }
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      const el = document.querySelector('.filters-section');
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
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
              : (event.categoryLabel && event.categoryLabel.toLowerCase() === cat.toLowerCase()) ||
                (event.category && event.category.toLowerCase() === cat.toLowerCase());

      const matchesQuery =
        !query ||
        event.title.toLowerCase().includes(query) ||
        event.description.toLowerCase().includes(query) ||
        event.venue.toLowerCase().includes(query) ||
        event.organizerName.toLowerCase().includes(query) ||
        (event.category && event.category.toLowerCase().includes(query)) ||
        (event.categoryLabel && event.categoryLabel.toLowerCase().includes(query)) ||
        (event.tags && event.tags.some((t) => t.toLowerCase().includes(query)));

      return matchesCategory && matchesQuery;
    });
  });

  // Modal State
  readonly activeRsvpEvent = signal<EventCardData | null>(null);
  readonly isSubmitting = signal(false);
  readonly rsvpError = signal('');
  readonly rsvpSuccess = signal<{ ticketCode: string; attendeeName: string } | null>(null);
  readonly copyFeedback = signal(false);
  readonly savedProfiles = signal<SavedProfile[]>([]);
  readonly selectedProfileId = signal<string>('');

  readonly rsvpForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    studentId: ['', [Validators.required]],
    saveProfile: [false],
    profileName: [''],
  });

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.currentPage.set(1);
  }

  setCategory(category: CategoryFilter): void {
    this.selectedCategory.set(category);
    this.currentPage.set(1);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.selectedCategory.set('ALL');
    this.currentPage.set(1);
  }

    openRsvp(event: EventCardData): void {
    this.activeRsvpEvent.set(event);
    this.rsvpSuccess.set(null);
    this.rsvpError.set('');
    this.copyFeedback.set(false);
    this.selectedProfileId.set('');

    // Pre-populate if user is already authenticated
    const user = this.auth.user();
    if (user) {
      this.rsvpForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        studentId: user.studentId || '',
        saveProfile: false,
        profileName: '',
      });
      this.auth.getProfiles().subscribe({
        next: (profiles) => {
          this.savedProfiles.set(profiles);
        },
        error: () => {
          this.savedProfiles.set([]);
        },
      });
    } else {
      this.savedProfiles.set([]);
      this.rsvpForm.reset({
        fullName: '',
        email: '',
        studentId: '',
        saveProfile: false,
        profileName: '',
      });
    }
  }

  onSelectProfile(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const profileId = target.value;
    this.selectedProfileId.set(profileId);
    if (!profileId) {
      const user = this.auth.user();
      if (user) {
        this.rsvpForm.patchValue({
          fullName: user.fullName,
          studentId: user.studentId || '',
        });
      }
      return;
    }
    const profile = this.savedProfiles().find((p) => p.id === profileId);
    if (profile) {
      this.rsvpForm.patchValue({
        fullName: profile.fullName,
        studentId: profile.studentId || '',
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

        if (currentUser && formVal.saveProfile && formVal.profileName?.trim()) {
      this.auth
        .saveProfile({
          profileName: formVal.profileName.trim(),
          fullName: formVal.fullName.trim(),
          studentId: formVal.studentId.trim(),
        })
        .subscribe({
          next: (saved) => {
            this.savedProfiles.update((list) => [...list, saved]);
          },
          error: () => {},
        });
    }

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
