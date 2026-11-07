import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

function toDateTimeLocalInput(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

@Component({
  imports: [ReactiveFormsModule, RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-event-shell',
  styleUrl: './event-shell.component.scss',
  templateUrl: './event-shell.component.html',
})
export class EventShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly organizerEvents = inject(OrganizerEventsService);
  readonly auth = inject(AuthService);

  readonly eventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('eventId') ?? '')),
    { initialValue: '' },
  );

  readonly events = this.organizerEvents.events;
  readonly event = computed(() => {
    const id = this.eventId();
    return this.events().find((e) => e.id === id);
  });

  readonly isStaff = computed(() => this.auth.user()?.role === 'STAFF');
  readonly isOrganizer = computed(() => this.auth.user()?.role === 'ORGANIZER' || this.auth.user()?.role === 'ADMIN');

  readonly shortId = computed(() => {
    const id = this.eventId();
    if (!id) return '#1';
    const numMatch = id.match(/\d+/);
    return numMatch ? `#${numMatch[0]}` : `#${id.slice(-4)}`;
  });

  readonly category = computed(() => {
    const ev = this.event();
    if (ev?.category) return ev.category;
    const title = (ev?.name || '').toLowerCase();
    if (title.includes('hackathon')) return 'HACKATHON';
    if (title.includes('workshop')) return 'WORKSHOP';
    if (title.includes('expo') || title.includes('demo')) return 'EXPO';
    return 'CONFERENCE';
  });

  readonly guestCount = computed(() => {
    const id = this.eventId();
    const registrants = this.organizerEvents.registrants().filter((r) => r.event_id === id);
    if (registrants.length > 0) return registrants.length;
    return this.event()?.registrations_count ?? 1;
  });

  // Active subtab detection
  readonly currentSubTab = signal<'overview' | 'scanner' | 'guests'>('overview');

  // Edit / Delete Dialog State
  readonly editing = signal(false);
  readonly deleting = signal(false);
  readonly isSaving = signal(false);
  readonly editErrorMessage = signal('');

  readonly editForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    if (!this.organizerEvents.eventsLoaded()) {
      this.organizerEvents.loadEvents().subscribe({ error: () => undefined });
    }

    this.detectSubTab(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.detectSubTab(event.urlAfterRedirects || event.url);
      });
  }

  private detectSubTab(url: string): void {
    if (url.includes('/scanner')) {
      this.currentSubTab.set('scanner');
    } else if (url.includes('/guests') || url.includes('/registrants')) {
      this.currentSubTab.set('guests');
    } else {
      this.currentSubTab.set('overview');
    }
  }

  openEdit(): void {
    const ev = this.event();
    if (!ev) return;
    this.editErrorMessage.set('');
    this.editForm.patchValue({
      name: ev.name,
      description: ev.description,
      venue: ev.venue,
      starts_at: toDateTimeLocalInput(ev.starts_at),
      ends_at: toDateTimeLocalInput(ev.ends_at),
      capacity: ev.capacity,
      allow_walk_ins: ev.allow_walk_ins,
    });
    this.editing.set(true);
  }

  closeEdit(): void {
    this.editing.set(false);
    this.editErrorMessage.set('');
  }

  saveEdit(): void {
    const ev = this.event();
    if (!ev) return;
    if (this.editForm.invalid) {
      this.editErrorMessage.set('Please fill out all required fields properly.');
      return;
    }

    const raw = this.editForm.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      this.editErrorMessage.set('Please provide valid start and end dates.');
      return;
    }
    if (endDate <= startDate) {
      this.editErrorMessage.set('End date & time must be after the start date & time.');
      return;
    }

    this.isSaving.set(true);
    this.organizerEvents
      .updateEvent(ev.id, {
        name: raw.name.trim(),
        description: raw.description.trim(),
        venue: raw.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity: Number(raw.capacity),
        allow_walk_ins: raw.allow_walk_ins,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.closeEdit();
        },
        error: (err: { error?: { message?: string } }) => {
          this.isSaving.set(false);
          this.editErrorMessage.set(err.error?.message || 'Could not save changes.');
        },
      });
  }

  openDelete(): void {
    this.deleting.set(true);
  }

  closeDelete(): void {
    this.deleting.set(false);
  }

  confirmDelete(): void {
    const ev = this.event();
    if (!ev) return;
    this.organizerEvents.deleteEvent(ev.id);
    this.closeDelete();
    this.router.navigate(['/organizer/dashboard']);
  }
}

