import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  AttendeeRsvp,
  RsvpCategory,
  RsvpStatus,
} from '../../../core/attendee/attendee-rsvp.models';
import { AttendeeRsvpService } from '../../../core/attendee/attendee-rsvp.service';

export type HistoryStatusFilter = 'ALL' | 'UPCOMING' | 'CHECKED_IN' | 'CANCELLED';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  selector: 'app-history',
  styleUrl: './history.component.scss',
  templateUrl: './history.component.html',
})
export class History implements OnInit {
  private readonly rsvpService = inject(AttendeeRsvpService);

  readonly rsvps = this.rsvpService.rsvps;
  readonly loading = this.rsvpService.loading;
  readonly loadError = this.rsvpService.error;

  // Filter & Search
  readonly statusFilter = signal<HistoryStatusFilter>('ALL');
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  // Clipboard & Feedback
  readonly copiedTicketCode = signal<string | null>(null);
  readonly feedbackMessage = signal<string>('');

  // QR Pass Modal
  readonly activeQrRsvp = signal<AttendeeRsvp | null>(null);
  readonly qrDataUrl = signal<string>('');
  readonly qrLoading = signal<boolean>(false);

  // Cancel Confirmation Modal
  readonly cancellingRsvp = signal<AttendeeRsvp | null>(null);
  readonly isCancelling = signal<boolean>(false);
  readonly cancelError = signal<string>('');

  ngOnInit(): void {
    this.loadRsvps();
  }

  loadRsvps(): void {
    this.rsvpService.loadMyRsvps().subscribe({ error: () => undefined });
  }

  // Summary Counts
  readonly totalCount = computed(() => this.rsvps().length);
  readonly upcomingCount = computed(
    () => this.rsvps().filter((r) => r.status === 'Registered').length,
  );
  readonly checkedInCount = computed(
    () => this.rsvps().filter((r) => r.status === 'Checked In').length,
  );
  readonly cancelledCount = computed(
    () => this.rsvps().filter((r) => r.status === 'Cancelled').length,
  );

  // Filtered List
  readonly filteredRsvps = computed(() => {
    const filterVal = this.statusFilter();
    const query = this.searchText().trim().toLocaleLowerCase();

    return this.rsvps()
      .filter((rsvp) => {
        switch (filterVal) {
          case 'UPCOMING':
            return rsvp.status === 'Registered';
          case 'CHECKED_IN':
            return rsvp.status === 'Checked In';
          case 'CANCELLED':
            return rsvp.status === 'Cancelled';
          case 'ALL':
          default:
            return true;
        }
      })
      .filter((rsvp) => {
        if (!query) return true;
        return (
          rsvp.eventName.toLocaleLowerCase().includes(query) ||
          rsvp.venue.toLocaleLowerCase().includes(query) ||
          rsvp.ticketCode.toLocaleLowerCase().includes(query) ||
          rsvp.categoryLabel.toLocaleLowerCase().includes(query)
        );
      });
  });

  setStatusFilter(filterVal: HistoryStatusFilter): void {
    this.statusFilter.set(filterVal);
  }

  copyTicketCode(ticketCode: string): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(ticketCode).then(() => {
        this.copiedTicketCode.set(ticketCode);
        setTimeout(() => {
          if (this.copiedTicketCode() === ticketCode) {
            this.copiedTicketCode.set(null);
          }
        }, 2000);
      });
    }
  }

  openQrPass(rsvp: AttendeeRsvp): void {
    this.activeQrRsvp.set(rsvp);
    this.qrLoading.set(true);
    this.qrDataUrl.set('');

    this.rsvpService.generateQrCode(rsvp.qrPayload).subscribe({
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
    this.activeQrRsvp.set(null);
    this.qrDataUrl.set('');
    this.qrLoading.set(false);
  }

  downloadQr(rsvp: AttendeeRsvp): void {
    const dataUrl = this.qrDataUrl();
    if (!dataUrl) return;

    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `pass-${rsvp.ticketCode}.png`;
    anchor.click();
  }

  initiateCancel(rsvp: AttendeeRsvp): void {
    this.cancellingRsvp.set(rsvp);
    this.cancelError.set('');
  }

  dismissCancel(): void {
    this.cancellingRsvp.set(null);
    this.cancelError.set('');
  }

  confirmCancel(): void {
    const rsvp = this.cancellingRsvp();
    if (!rsvp) return;

    this.isCancelling.set(true);
    this.cancelError.set('');

    this.rsvpService.cancelRsvp(rsvp.ticketCode).subscribe({
      next: (updated) => {
        this.isCancelling.set(false);
        this.cancellingRsvp.set(null);
        this.feedbackMessage.set(`Your RSVP for ${updated.eventName} has been cancelled.`);
        setTimeout(() => this.feedbackMessage.set(''), 4000);
      },
      error: (err: HttpErrorResponse) => {
        this.isCancelling.set(false);
        this.cancelError.set(err.error?.message ?? 'Failed to cancel RSVP. Please try again.');
      },
    });
  }

  statusClass(status: RsvpStatus): string {
    switch (status) {
      case 'Checked In':
        return 'status-checked-in';
      case 'Cancelled':
        return 'status-cancelled';
      default:
        return 'status-registered';
    }
  }

  categoryClass(category: RsvpCategory): string {
    switch (category) {
      case 'HACKATHON':
        return 'category-hackathon';
      case 'WORKSHOP':
        return 'category-workshop';
      case 'EXPO':
        return 'category-expo';
      default:
        return 'category-conference';
    }
  }
}
