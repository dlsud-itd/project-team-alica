import { DatePipe, PercentPipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
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

  readonly now = new Date();
  readonly events = this.organizerEvents.events;
  readonly totalRegistrations = this.organizerEvents.totalRegistrations;
  readonly loading = this.organizerEvents.loading;
  readonly loadError = this.organizerEvents.error;
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
      const matchesStatus = status === 'All statuses' || event.status === status;
      return matchesQuery && matchesStatus;
    });
  });
  readonly upcomingEvents = computed(
    () => this.events().filter((event) => event.status === 'Upcoming').length,
  );
  readonly openSeats = computed(() =>
    this.events().reduce(
      (total, event) => total + Math.max(event.capacity - event.registrations_count, 0),
      0,
    ),
  );
  readonly notice = signal('');

  // Edit Event State
  readonly editingEvent = signal<OrganizerEvent | null>(null);
  readonly editErrorMessage = signal('');

  // Delete Event State
  readonly deletingEvent = signal<OrganizerEvent | null>(null);

  readonly editForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number>(10, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    status: new FormControl<'Upcoming' | 'In progress' | 'Completed'>('Upcoming', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  registrationProgress(registered: number, capacity: number): number {
    return capacity > 0 ? Math.min(registered / capacity, 1) : 0;
  }

  reloadEvents(): void {
    this.organizerEvents.load();
  }

  showEditNotice(eventName: string): void {
    this.notice.set(`Event editing for "${eventName}" is coming soon.`);
  }

  openEdit(event: OrganizerEvent): void {
    this.editingEvent.set(event);
    this.editErrorMessage.set('');
    this.editForm.patchValue({
      name: event.name,
      venue: event.venue,
      starts_at: toDateTimeLocalInput(event.starts_at),
      ends_at: toDateTimeLocalInput(event.ends_at),
      capacity: event.capacity,
      status: event.status,
    });
  }

  closeEdit(): void {
    this.editingEvent.set(null);
    this.editErrorMessage.set('');
    this.editForm.reset();
  }

  saveEdit(): void {
    const currentEvent = this.editingEvent();
    if (!currentEvent) {
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

    if (raw.capacity < currentEvent.registrations_count) {
      this.editErrorMessage.set(
        `Capacity cannot be lower than current registrations (${currentEvent.registrations_count}).`,
      );
      return;
    }

    const updatedName = raw.name.trim();
    this.organizerEvents.updateEvent(currentEvent.id, {
      name: updatedName,
      venue: raw.venue.trim(),
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      capacity: Number(raw.capacity),
      status: raw.status,
    });

    this.notice.set(`Event "${updatedName}" updated successfully.`);
    this.closeEdit();
  }

  openDelete(event: OrganizerEvent): void {
    this.deletingEvent.set(event);
  }

  closeDelete(): void {
    this.deletingEvent.set(null);
  }

  confirmDelete(): void {
    const target = this.deletingEvent();
    if (!target) return;

    this.organizerEvents.deleteEvent(target.id);
    this.notice.set(`Event "${target.name}" was deleted.`);
    this.closeDelete();
    this.closeEdit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.deletingEvent()) {
      this.closeDelete();
    } else if (this.editingEvent()) {
      this.closeEdit();
    }
  }
}