import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { filter, from, map, switchMap } from 'rxjs';
import * as QRCode from 'qrcode';
import {
  EventRegistrant,
  RegistrationStatus,
} from '../../../core/organizer/organizer.models';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';

export type RegistrantFilter = 'ALL' | 'Registered' | 'Checked In' | 'Cancelled';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  selector: 'app-organizer-registrants',
  styleUrl: './registrants.component.scss',
  templateUrl: './registrants.component.html',
})
export class OrganizerRegistrants {
  private readonly route = inject(ActivatedRoute);
  private readonly organizerEvents = inject(OrganizerEventsService);

  readonly eventId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('eventId') ?? '')),
    { initialValue: '' },
  );
  readonly eventsLoaded = this.organizerEvents.eventsLoaded;
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly actionLoading = signal(false);

  // Status Filter
  readonly statusFilter = signal<RegistrantFilter>('ALL');

  // Modal States
  readonly selectedRegistrant = signal<EventRegistrant | null>(null);
  readonly activeQrRegistrant = signal<EventRegistrant | null>(null);
  readonly qrDataUrl = signal<string>('');
  readonly qrLoading = signal<boolean>(false);
  readonly cancellingRegistrant = signal<EventRegistrant | null>(null);
  readonly restoringRegistrant = signal<EventRegistrant | null>(null);

  constructor() {
    if (!this.organizerEvents.eventsLoaded()) {
      this.reloadEvents();
    }

    this.route.paramMap
      .pipe(
        map((params) => params.get('eventId') ?? ''),
        filter(Boolean),
        switchMap((eventId) => this.organizerEvents.loadRegistrants(eventId)),
        takeUntilDestroyed(),
      )
      .subscribe({
        error: () => this.errorMessage.set('Could not load registrants. Please try again later.'),
      });
  }

  readonly event = computed(() => this.organizerEvents.eventById(this.eventId()));
  readonly loading = this.organizerEvents.loading;
  readonly loadError = this.organizerEvents.error;
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  readonly allEventAttendees = computed(() =>
    this.organizerEvents.registrants().filter((registrant) => registrant.event_id === this.eventId()),
  );

  readonly registeredCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Registered').length,
  );
  readonly checkedInCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Checked In').length,
  );
  readonly cancelledCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Cancelled').length,
  );

  readonly attendees = computed(() => {
    const filterVal = this.statusFilter();
    const query = this.searchText().trim().toLocaleLowerCase();

    return this.allEventAttendees()
      .filter((registrant) => {
        if (filterVal === 'ALL') return true;
        return registrant.status === filterVal;
      })
      .filter((registrant) => {
        if (!query) return true;
        return (
          registrant.full_name.toLocaleLowerCase().includes(query) ||
          registrant.email.toLocaleLowerCase().includes(query) ||
          registrant.ticket_id.toLocaleLowerCase().includes(query)
        );
      });
  });

  setStatusFilter(filterVal: RegistrantFilter): void {
    this.statusFilter.set(filterVal);
  }

  toggleCheckIn(registrant: EventRegistrant): void {
    this.errorMessage.set('');
    this.successMessage.set('');
    this.organizerEvents.toggleCheckIn(registrant).subscribe({
      next: (updated) => {
        this.successMessage.set(
          `Updated check-in status for ${updated.full_name} to ${updated.status}.`,
        );
      },
      error: (err: HttpErrorResponse) => {
        this.errorMessage.set(err.error?.message ?? 'Could not update check-in status.');
      },
    });
  }

  openQrPass(registrant: EventRegistrant): void {
    this.activeQrRegistrant.set(registrant);
    this.qrLoading.set(true);
    this.qrDataUrl.set('');

    const options: QRCode.QRCodeToDataURLOptions = {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
    };

    from(QRCode.toDataURL(registrant.ticket_id, options)).subscribe({
      next: (url) => {
        this.qrDataUrl.set(url);
        this.qrLoading.set(false);
      },
      error: () => {
        this.qrLoading.set(false);
      },
    });
  }

  closeQrPass(): void {
    this.activeQrRegistrant.set(null);
    this.qrDataUrl.set('');
    this.qrLoading.set(false);
  }

  downloadQr(registrant: EventRegistrant): void {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `pass-${registrant.ticket_id}.png`;
    anchor.click();
  }

  confirmCancel(registrant: EventRegistrant): void {
    this.cancellingRegistrant.set(registrant);
    this.errorMessage.set('');
  }

  dismissCancelDialog(): void {
    this.cancellingRegistrant.set(null);
  }

  executeCancel(): void {
    const registrant = this.cancellingRegistrant();
    const eventId = this.eventId();
    if (!registrant || !eventId) return;

    this.actionLoading.set(true);
    this.errorMessage.set('');
    this.organizerEvents.cancelRegistrant(eventId, registrant.id).subscribe({
      next: (updated) => {
        this.actionLoading.set(false);
        this.cancellingRegistrant.set(null);
        if (this.selectedRegistrant()?.id === registrant.id) {
          this.selectedRegistrant.set(updated);
        }
        this.successMessage.set(`Registration for ${updated.full_name} has been cancelled.`);
      },
      error: (err: HttpErrorResponse) => {
        this.actionLoading.set(false);
        this.errorMessage.set(err.error?.message ?? 'Failed to cancel registration.');
      },
    });
  }

  confirmRestore(registrant: EventRegistrant): void {
    this.restoringRegistrant.set(registrant);
    this.errorMessage.set('');
  }

  dismissRestoreDialog(): void {
    this.restoringRegistrant.set(null);
  }

  executeRestore(): void {
    const registrant = this.restoringRegistrant();
    const eventId = this.eventId();
    if (!registrant || !eventId) return;

    this.actionLoading.set(true);
    this.errorMessage.set('');
    this.organizerEvents.restoreRegistrant(eventId, registrant.id).subscribe({
      next: (updated) => {
        this.actionLoading.set(false);
        this.restoringRegistrant.set(null);
        if (this.selectedRegistrant()?.id === registrant.id) {
          this.selectedRegistrant.set(updated);
        }
        this.successMessage.set(`Registration for ${updated.full_name} has been restored.`);
      },
      error: (err: HttpErrorResponse) => {
        this.actionLoading.set(false);
        this.errorMessage.set(err.error?.message ?? 'Failed to restore registration.');
      },
    });
  }

  reloadEvents(): void {
    this.organizerEvents.loadEvents().subscribe({ error: () => undefined });
  }

  statusClass(status: RegistrationStatus): string {
    switch (status) {
      case 'Checked In':
        return 'status-checked-in';
      case 'Cancelled':
        return 'status-cancelled';
      default:
        return 'status-registered';
    }
  }

  exportRegistrants(): void {
    const columns: Array<keyof EventRegistrant> = [
      'full_name',
      'email',
      'ticket_id',
      'registered_at',
      'status',
    ];
    const rows = this.allEventAttendees().map((attendee) =>
      columns.map((column) => this.escapeCsv(String(attendee[column]))).join(','),
    );
    const csv = [columns.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.event()?.name ?? 'event'}-registrants.csv`
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private escapeCsv(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }
}
