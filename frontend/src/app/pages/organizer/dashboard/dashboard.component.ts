import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

export type EventFormatFilter = 'ALL' | 'CONFERENCE' | 'EXPO' | 'MEETUP' | 'HACKATHON' | 'WORKSHOP';

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
  imports: [DatePipe, DecimalPipe, PercentPipe, ReactiveFormsModule, RouterLink],
  selector: 'app-organizer-dashboard',
  styleUrl: './dashboard.component.scss',
  templateUrl: './dashboard.component.html',
})
export class OrganizerDashboard {
  private readonly organizerEvents = inject(OrganizerEventsService);

  constructor() {
    this.reloadEvents();

    effect(() => {
      // Reset page to 1 when search or category changes
      this.searchText();
      this.selectedFormat();
      this.currentPage.set(1);
    });
  }

  readonly now = new Date();
  readonly Math = Math;
  readonly minStart = toDateTimeLocalInput(new Date().toISOString());
  readonly events = this.organizerEvents.events;
  readonly totalRegistrations = this.organizerEvents.totalRegistrations;
  readonly loading = this.organizerEvents.loading;
  readonly loadError = this.organizerEvents.error;

  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly statusControl = new FormControl('All statuses', { nonNullable: true });
  readonly selectedFormat = signal<EventFormatFilter>('ALL');

  readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly selectedStatus = toSignal(this.statusControl.valueChanges, {
    initialValue: 'All statuses',
  });

  // Pagination
  readonly pageSize = 5;
  readonly currentPage = signal(1);

  readonly filteredEvents = computed(() => {
    const query = this.searchText().trim().toLocaleLowerCase();
    const status = this.selectedStatus();
    const format = this.selectedFormat();

    return this.events().filter((event) => {
      const matchesQuery =
        !query ||
        event.name.toLocaleLowerCase().includes(query) ||
        event.venue.toLocaleLowerCase().includes(query);

      const matchesStatus =
        status === 'All statuses' || event.status === status || event.approval_status === status;

      const eventCategory = this.getCategory(event);
      const matchesFormat =
        format === 'ALL' ||
        eventCategory === format ||
        (format === 'MEETUP' && event.name.toLowerCase().includes('meetup'));

      return matchesQuery && matchesStatus && matchesFormat;
    });
  });

  readonly totalPages = computed(() =>
    Math.max(Math.ceil(this.filteredEvents().length / this.pageSize), 1),
  );

  readonly paginatedEvents = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredEvents().slice(start, start + this.pageSize);
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

  // Create / Edit Event dialog state
  readonly creating = signal(false);
  readonly editingEvent = signal<OrganizerEvent | null>(null);
  readonly dialogOpen = computed(() => this.creating() || this.editingEvent() !== null);
  readonly editErrorMessage = signal('');
  readonly isSaving = signal(false);
  readonly coOrganizerEmails = signal<string[]>([]);

  // Delete Event State
  readonly deletingEvent = signal<OrganizerEvent | null>(null);

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

  setFormat(format: EventFormatFilter): void {
    this.selectedFormat.set(format);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  getCategory(event: OrganizerEvent): string {
    if (event.category) return event.category;
    const lower = event.name.toLowerCase();
    if (lower.includes('hackathon')) return 'HACKATHON';
    if (lower.includes('workshop')) return 'WORKSHOP';
    if (lower.includes('expo') || lower.includes('demo')) return 'EXPO';
    if (lower.includes('meetup')) return 'MEETUP';
    return 'CONFERENCE';
  }

  getCategoryLabel(event: OrganizerEvent): string {
    if (event.category_label) return event.category_label;
    const cat = this.getCategory(event);
    switch (cat) {
      case 'HACKATHON':
        return 'Hackathon';
      case 'WORKSHOP':
        return 'Workshop';
      case 'EXPO':
        return 'Expo';
      case 'MEETUP':
        return 'Meetup';
      default:
        return 'Conference';
    }
  }

  getGatesCount(event: OrganizerEvent): number {
    return event.checkpoints_count ?? (event.name.includes('DevCon') ? 8 : event.name.includes('Expo') ? 6 : 4);
  }

  getAdmittedCount(event: OrganizerEvent): number {
    return event.admitted_count ?? (event.registrations_count > 0 ? 1 : 0);
  }

  getAdmittedPercent(event: OrganizerEvent): number {
    const admitted = this.getAdmittedCount(event);
    const capacity = event.capacity || 1000;
    return Math.min(Math.round((admitted / capacity) * 100), 100);
  }

  registrationProgress(registered: number, capacity: number | null): number {
    return capacity ? Math.min(registered / capacity, 1) : 0;
  }

  openCreate(): void {
    this.editingEvent.set(null);
    this.editErrorMessage.set('');
    this.editForm.reset();
    this.coOrganizerEmails.set([]);
    this.creating.set(true);
  }

  reloadEvents(): void {
    this.organizerEvents.loadEvents().subscribe({ error: () => undefined });
  }

  addCoOrganizerEmail(input: HTMLInputElement): void {
    const email = input.value.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@') || !email.includes('.')) {
      this.editErrorMessage.set('Please enter a valid email address.');
      return;
    }
    if (this.coOrganizerEmails().includes(email)) {
      this.editErrorMessage.set('This organizer email has already been added.');
      return;
    }
    this.coOrganizerEmails.update((list) => [...list, email]);
    input.value = '';
    this.editErrorMessage.set('');
  }

  removeCoOrganizerEmail(index: number): void {
    this.coOrganizerEmails.update((list) => list.filter((_, i) => i !== index));
  }

  openEdit(event: OrganizerEvent): void {
    this.creating.set(false);
    this.editingEvent.set(event);
    this.editErrorMessage.set('');
    const existingEmails = event.organizers
      ? event.organizers.filter((o) => !o.isPrimary).map((o) => o.email)
      : [];
    this.coOrganizerEmails.set(existingEmails);
    this.editForm.patchValue({
      name: event.name,
      description: event.description,
      venue: event.venue,
      starts_at: toDateTimeLocalInput(event.starts_at),
      ends_at: toDateTimeLocalInput(event.ends_at),
      capacity: event.capacity,
      allow_walk_ins: event.allow_walk_ins,
    });

    if (!event.organizers) {
      this.organizerEvents.loadOrganizers(event.id).subscribe({
        next: (list) => {
          this.coOrganizerEmails.set(list.filter((o) => !o.isPrimary).map((o) => o.email));
        },
        error: () => undefined,
      });
    }
  }

  closeEdit(): void {
    this.creating.set(false);
    this.editingEvent.set(null);
    this.editErrorMessage.set('');
    this.editForm.reset();
    this.coOrganizerEmails.set([]);
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
      organizerEmails: this.coOrganizerEmails(),
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
    } else if (this.dialogOpen()) {
      this.closeEdit();
    }
  }
}
