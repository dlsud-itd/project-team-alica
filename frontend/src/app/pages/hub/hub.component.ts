import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import { AttendeeRsvp } from '../../core/attendee/attendee-rsvp.models';
import { AttendeeRsvpService } from '../../core/attendee/attendee-rsvp.service';
import { OrganizerEventsService } from '../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../core/organizer/organizer.models';
import { ScannerApi } from '../../core/staff/scanner-api';
import { StaffCheckpoint } from '../../core/staff/scanner.models';
import { AuthService } from '../../core/auth/auth.service';

export type HubTab = 'attending' | 'organizing' | 'staffing';

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
  selector: 'app-hub',
  standalone: true,
  imports: [CommonModule, DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './hub.component.html',
  styleUrl: './hub.component.scss',
})
export class HubComponent implements OnInit {
  private readonly rsvpService = inject(AttendeeRsvpService);
  private readonly organizerService = inject(OrganizerEventsService);
  private readonly scannerApi = inject(ScannerApi);
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);

  readonly activeTab = signal<HubTab>('attending');

  // Attending state
  readonly rsvps = this.rsvpService.rsvps;
  readonly rsvpsLoading = this.rsvpService.loading;
  readonly rsvpsError = this.rsvpService.error;
  readonly activeQrRsvp = signal<AttendeeRsvp | null>(null);
  readonly qrDataUrl = signal<string>('');
  readonly qrLoading = signal<boolean>(false);
  readonly copiedCode = signal<string | null>(null);

  // Organizing state
  readonly organizedEvents = this.organizerService.events;
  readonly organizedLoading = this.organizerService.loading;
  readonly isCreateModalOpen = signal(false);
  readonly isSubmittingEvent = signal(false);
  readonly createEventError = signal('');
  readonly minStart = toDateTimeLocalInput(new Date().toISOString());

  // Staffing state
  readonly assignedCheckpoints = signal<StaffCheckpoint[]>([]);
  readonly staffingLoading = signal(false);
  readonly staffingError = signal('');

  // Counts
  readonly attendingCount = computed(() => this.rsvps().length);
  readonly organizingCount = computed(() => this.organizedEvents().length);
  readonly staffingCount = computed(() => this.assignedCheckpoints().length);

  // Create Event Form
  readonly eventForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1)],
    }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
    is_private: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.loadAllData();
  }

  loadAllData(): void {
    this.rsvpService.loadMyRsvps().subscribe({
      next: (items) => {
        // If user has no RSVPs but organizes events, default to organizing tab
        if (items.length === 0 && this.organizedEvents().length > 0) {
          this.activeTab.set('organizing');
        }
      },
      error: () => undefined,
    });

    this.organizerService.loadEvents().subscribe({
      next: (events) => {
        if (this.rsvps().length === 0 && events.length > 0) {
          this.activeTab.set('organizing');
        }
      },
      error: () => undefined,
    });

    this.staffingLoading.set(true);
    this.scannerApi.getMyCheckpoints().subscribe({
      next: (checkpoints) => {
        this.assignedCheckpoints.set(checkpoints);
        this.staffingLoading.set(false);
      },
      error: (err) => {
        this.staffingError.set('Unable to load assigned checkpoints');
        this.staffingLoading.set(false);
      },
    });
  }

  setTab(tab: HubTab): void {
    this.activeTab.set(tab);
  }

  // QR Pass modal
  openQrPass(rsvp: AttendeeRsvp): void {
    this.activeQrRsvp.set(rsvp);
    this.qrLoading.set(true);
    this.qrDataUrl.set('');

    const payload = rsvp.ticketCode;
    QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: { dark: '#0d5c46', light: '#ffffff' },
    })
      .then((url) => {
        this.qrDataUrl.set(url);
        this.qrLoading.set(false);
      })
      .catch(() => {
        this.qrLoading.set(false);
      });
  }

  closeQrPass(): void {
    this.activeQrRsvp.set(null);
    this.qrDataUrl.set('');
  }

  copyTicketCode(code: string): void {
    navigator.clipboard?.writeText(code).then(() => {
      this.copiedCode.set(code);
      setTimeout(() => this.copiedCode.set(null), 2000);
    });
  }

  // Event Creation
  openCreateModal(): void {
    this.createEventError.set('');
    const now = new Date();
    const start = new Date(now.getTime() + 60 * 60 * 1000);
    const end = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    this.eventForm.reset({
      name: '',
      description: '',
      venue: '',
      starts_at: toDateTimeLocalInput(start.toISOString()),
      ends_at: toDateTimeLocalInput(end.toISOString()),
      capacity: 100,
      allow_walk_ins: false,
      is_private: false,
    });
    this.isCreateModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.isCreateModalOpen.set(false);
  }

  onSubmitCreateEvent(): void {
    if (this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    const val = this.eventForm.getRawValue();
    const startDate = new Date(val.starts_at);
    const endDate = new Date(val.ends_at);

    if (endDate <= startDate) {
      this.createEventError.set('End time must be after the start time.');
      return;
    }

    this.isSubmittingEvent.set(true);
    this.createEventError.set('');

    this.organizerService
      .createEvent({
        name: val.name.trim(),
        description: val.description.trim() || '',
        venue: val.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity: Number(val.capacity) || 100,
        allow_walk_ins: val.allow_walk_ins,
        is_private: val.is_private,
      })
      .subscribe({
        next: (created) => {
          this.isSubmittingEvent.set(false);
          this.closeCreateModal();
          this.router.navigate(['/organizer/events', created.id, 'overview']);
        },
        error: (err) => {
          this.isSubmittingEvent.set(false);
          this.createEventError.set(err?.error?.message || 'Failed to create event. Please try again.');
        },
      });
  }

  launchScanner(checkpoint: StaffCheckpoint): void {
    this.router.navigate(['/staff/scanner'], {
      queryParams: { checkpointId: checkpoint.id },
    });
  }
}
