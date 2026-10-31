import { DatePipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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
  imports: [DatePipe, PercentPipe, ReactiveFormsModule, RouterLink],
  selector: 'app-organizer-dashboard',
  styleUrl: './dashboard.component.scss',
  templateUrl: './dashboard.component.html',
})
export class OrganizerDashboard {
  private readonly organizerEvents = inject(OrganizerEventsService);

  constructor() {
    this.organizerEvents.loadEvents().subscribe({
      error: () => this.notice.set('Could not load your events. Please try again later.'),
    });
  }

  readonly now = new Date();
  readonly minStart = toDateTimeLocalInput(new Date().toISOString());
  readonly events = this.organizerEvents.events;
  readonly totalRegistrations = this.organizerEvents.totalRegistrations;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl('All statuses', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  private readonly selectedStatus = toSignal(this.statusControl.valueChanges, {
    initialValue: 'All statuses',
  });
  readonly filteredEvents = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const status = this.selectedStatus();

    return this.events().filter((event) => {
      const matchesQuery =
        !query ||
        event.name.toLocaleLowerCase().includes(query) ||
        event.venue.toLocaleLowerCase().includes(query);
      const matchesStatus =
        status === 'All statuses' || event.status === status || event.approval_status === status;
      return matchesQuery && matchesStatus;
    });
  });
  readonly upcomingEvents = computed(
    () =>
      this.events().filter(
        (event) => event.status === 'Upcoming' && event.approval_status === 'Approved',
      ).length,
  );
  readonly pendingEvents = computed(
    () => this.events().filter((event) => event.approval_status === 'Pending').length,
  );
  readonly openSeats = computed(() =>
    this.events().reduce(
      (total, event) =>
        total +
        (event.capacity === null ? 0 : Math.max(event.capacity - event.registrations_count, 0)),
      0,
    ),
  );
  readonly notice = signal('');

  // Create / Edit Event dialog state. `creating` is the create mode;
  // `editingEvent` is set when editing an existing event.
  readonly creating = signal(false);
  readonly editingEvent = signal<OrganizerEvent | null>(null);
  readonly dialogOpen = computed(() => this.creating() || this.editingEvent() !== null);
  readonly editErrorMessage = signal('');
  readonly isSaving = signal(false);

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

  registrationProgress(registered: number, capacity: number | null): number {
    return capacity ? Math.min(registered / capacity, 1) : 0;
  }

  openCreate(): void {
    this.editingEvent.set(null);
    this.editErrorMessage.set('');
    this.editForm.reset();
    this.creating.set(true);
  }

  openEdit(event: OrganizerEvent): void {
    this.creating.set(false);
    this.editingEvent.set(event);
    this.editErrorMessage.set('');
    this.editForm.patchValue({
      name: event.name,
      description: event.description,
      venue: event.venue,
      starts_at: toDateTimeLocalInput(event.starts_at),
      ends_at: toDateTimeLocalInput(event.ends_at),
      capacity: event.capacity,
      allow_walk_ins: event.allow_walk_ins,
    });
  }

  closeEdit(): void {
    this.creating.set(false);
    this.editingEvent.set(null);
    this.editErrorMessage.set('');
    this.editForm.reset();
  }

  saveEdit(): void {
    const currentEvent = this.editingEvent();
    if (!currentEvent && !this.creating()) {
      return;
    }

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

    if (!currentEvent && startDate <= new Date()) {
      this.editErrorMessage.set('Start date & time must be in the future.');
      return;
    }

    const capacity = Number(raw.capacity);
    if (currentEvent && capacity < currentEvent.registrations_count) {
      this.editErrorMessage.set(
        `Capacity cannot be lower than current registrations (${currentEvent.registrations_count}).`,
      );
      return;
    }

    const payload = {
      name: raw.name.trim(),
      description: raw.description.trim(),
      venue: raw.venue.trim(),
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      capacity,
      allow_walk_ins: raw.allow_walk_ins,
    };

    this.isSaving.set(true);
    const request = currentEvent
      ? this.organizerEvents.updateEvent(currentEvent.id, payload)
      : this.organizerEvents.createEvent(payload);

    request.subscribe({
      next: (saved) => {
        this.isSaving.set(false);
        if (!currentEvent) {
          this.notice.set(`"${saved.name}" was submitted and is awaiting admin approval.`);
        } else if (currentEvent.approval_status === 'Rejected' && saved.approval_status === 'Pending') {
          this.notice.set(`"${saved.name}" was updated and resubmitted for admin approval.`);
        } else {
          this.notice.set(`Event "${saved.name}" updated successfully.`);
        }
        this.closeEdit();
      },
      error: (err: HttpErrorResponse) => {
        this.isSaving.set(false);
        this.editErrorMessage.set(
          err.error?.message ?? 'Could not save changes. Please try again.',
        );
      },
    });
  }
}
