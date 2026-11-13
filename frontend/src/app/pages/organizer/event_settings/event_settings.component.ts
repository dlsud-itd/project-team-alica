import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventOrganizer, OrganizerEvent } from '../../../core/organizer/organizer.models';

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
  imports: [DatePipe, ReactiveFormsModule],
  selector: 'app-event-settings',
  styleUrl: './event_settings.component.scss',
  templateUrl: './event_settings.component.html',
})
export class EventSettingsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly organizerEvents = inject(OrganizerEventsService);
  readonly auth = inject(AuthService);

  readonly eventId = signal('');
  readonly isSavingGeneral = signal(false);
  readonly generalSuccess = signal('');
  readonly generalError = signal('');

  // Organizers state
  readonly organizers = signal<EventOrganizer[]>([]);
  readonly organizersLoading = signal(false);
  readonly addingOrganizer = signal(false);
  readonly organizerError = signal('');
  readonly organizerSuccess = signal('');

  // Delete state
  readonly deleting = signal(false);

  private routeSub?: Subscription;

  readonly events = this.organizerEvents.events;
  readonly event = computed<OrganizerEvent | undefined>(() => {
    const id = this.eventId();
    return this.events().find((e) => e.id === id);
  });

  readonly isOwner = computed(() => {
    const user = this.auth.user();
    const ev = this.event();
    if (!user || !ev) return false;
    return user.role === 'ADMIN' || ev.organizer_id === user.id;
  });

  readonly primaryOrganizer = computed(() =>
    this.organizers().find((o) => o.isPrimary),
  );

  readonly coOrganizers = computed(() =>
    this.organizers().filter((o) => !o.isPrimary),
  );

  readonly generalForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
    is_private: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      this.routeSub = parent.paramMap.subscribe((params) => {
        const id = params.get('eventId') ?? '';
        if (id) {
          this.eventId.set(id);
          this.syncEventData();
          this.loadOrganizers(id);
        }
      });
    } else {
      const id = this.route.snapshot.paramMap.get('eventId') ?? '';
      if (id) {
        this.eventId.set(id);
        this.syncEventData();
        this.loadOrganizers(id);
      }
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  syncEventData(): void {
    if (!this.organizerEvents.eventsLoaded()) {
      this.organizerEvents.loadEvents().subscribe({
        next: () => this.populateForm(),
        error: () => undefined,
      });
    } else {
      this.populateForm();
    }
  }

  private populateForm(): void {
    const ev = this.event();
    if (!ev) return;
    this.generalForm.patchValue({
      name: ev.name,
      description: ev.description,
      venue: ev.venue,
      starts_at: toDateTimeLocalInput(ev.starts_at),
      ends_at: toDateTimeLocalInput(ev.ends_at),
      capacity: ev.capacity,
      allow_walk_ins: ev.allow_walk_ins,
      is_private: ev.is_private ?? false,
    });
  }

  loadOrganizers(eventId: string): void {
    this.organizersLoading.set(true);
    this.organizerEvents.loadOrganizers(eventId).subscribe({
      next: (list) => {
        this.organizers.set(list);
        this.organizersLoading.set(false);
      },
      error: () => {
        this.organizersLoading.set(false);
      },
    });
  }

  saveGeneralSettings(): void {
    const ev = this.event();
    if (!ev) return;

    if (this.generalForm.invalid) {
      this.generalError.set('Please fill out all required fields properly.');
      return;
    }

    const raw = this.generalForm.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      this.generalError.set('Please provide valid start and end dates.');
      return;
    }
    if (endDate <= startDate) {
      this.generalError.set('End date & time must be after the start date & time.');
      return;
    }

    const capacity = Number(raw.capacity);
    if (capacity < ev.registrations_count) {
      this.generalError.set(
        `Capacity cannot be lower than current registrations (${ev.registrations_count}).`,
      );
      return;
    }

    this.isSavingGeneral.set(true);
    this.generalError.set('');
    this.generalSuccess.set('');

    this.organizerEvents
      .updateEvent(ev.id, {
        name: raw.name.trim(),
        description: raw.description.trim(),
        venue: raw.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity,
        allow_walk_ins: raw.allow_walk_ins,
        is_private: raw.is_private,
      })
      .subscribe({
        next: (saved) => {
          this.isSavingGeneral.set(false);
          this.generalSuccess.set(`Event settings for "${saved.name}" have been updated.`);
        },
        error: (err: { error?: { message?: string } }) => {
          this.isSavingGeneral.set(false);
          this.generalError.set(err.error?.message ?? 'Could not save event settings.');
        },
      });
  }

  addOrganizerMember(emailInput: HTMLInputElement): void {
    const cleanEmail = emailInput.value.trim().toLowerCase();
    const id = this.eventId();
    if (!cleanEmail || !id) return;

    this.addingOrganizer.set(true);
    this.organizerError.set('');
    this.organizerSuccess.set('');

    this.organizerEvents.addOrganizer(id, cleanEmail).subscribe({
      next: (added) => {
        this.addingOrganizer.set(false);
        emailInput.value = '';
        this.organizerSuccess.set(`Added ${added.fullName} (${added.email}) as co-organizer.`);
        this.loadOrganizers(id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.addingOrganizer.set(false);
        this.organizerError.set(
          err.error?.message ?? 'Failed to add co-organizer. Ensure the user is registered.',
        );
      },
    });
  }

  removeOrganizerMember(userId: string): void {
    const id = this.eventId();
    if (!userId || !id) return;

    this.organizerError.set('');
    this.organizerSuccess.set('');

    this.organizerEvents.removeOrganizer(id, userId).subscribe({
      next: () => {
        this.organizerSuccess.set('Co-organizer removed successfully.');
        this.loadOrganizers(id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.organizerError.set(err.error?.message ?? 'Could not remove co-organizer.');
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
    this.router.navigate(['/hub']);
  }
}
