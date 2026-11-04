import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminEventsService } from '../../../core/admin/admin-events.service';
import { AdminEvent, ReviewDecision } from '../../../core/admin/admin.models';
import { ApprovalStatus } from '../../../core/organizer/organizer.models';

export type ApprovalTab = ApprovalStatus | 'All';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  selector: 'app-admin-dashboard',
  // Shares the organizer dashboard's table, card and dialog styles.
  styleUrls: [
    '../../organizer/dashboard/dashboard.component.scss',
    './dashboard.component.scss',
  ],
  templateUrl: './dashboard.component.html',
})
export class AdminDashboard {
  private readonly adminEvents = inject(AdminEventsService);

  constructor() {
    this.adminEvents.loadEvents().subscribe({
      error: () => this.notice.set('Could not load events. Please try again later.'),
    });
  }

  readonly now = new Date();
  readonly tabs: ApprovalTab[] = ['Pending', 'Approved', 'Rejected', 'All'];
  readonly events = this.adminEvents.events;
  readonly eventsLoaded = this.adminEvents.eventsLoaded;
  readonly activeTab = signal<ApprovalTab>('Pending');
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly notice = signal('');

  readonly counts = computed(() => {
    const counts: Record<ApprovalTab, number> = {
      Pending: 0,
      Approved: 0,
      Rejected: 0,
      All: this.events().length,
    };
    for (const event of this.events()) counts[event.approval_status]++;
    return counts;
  });

  readonly totalRegistrations = computed(() =>
    this.events().reduce((total, event) => total + event.registrations_count, 0),
  );

  readonly filteredEvents = computed(() => {
    const tab = this.activeTab();
    const query = this.searchText().trim().toLocaleLowerCase();

    return this.events().filter((event) => {
      const matchesTab = tab === 'All' || event.approval_status === tab;
      const matchesQuery =
        !query ||
        [event.name, event.venue, event.organizer_name, event.organizer_email].some((field) =>
          field.toLocaleLowerCase().includes(query),
        );
      return matchesTab && matchesQuery;
    });
  });

  // Review dialog state
  readonly reviewingEvent = signal<AdminEvent | null>(null);
  readonly reviewNotes = new FormControl('', { nonNullable: true });
  readonly reviewError = signal('');
  readonly submittingDecision = signal<ReviewDecision | null>(null);

  openReview(event: AdminEvent): void {
    this.reviewingEvent.set(event);
    this.reviewNotes.setValue(event.review_notes ?? '');
    this.reviewError.set('');
  }

  closeReview(): void {
    this.reviewingEvent.set(null);
    this.reviewNotes.reset();
    this.reviewError.set('');
  }

  submitReview(decision: ReviewDecision): void {
    const event = this.reviewingEvent();
    if (!event) return;

    const notes = this.reviewNotes.value.trim();
    if (decision === 'REJECTED' && !notes) {
      this.reviewError.set('Please add a reason so the organizer knows what to revise.');
      return;
    }

    this.submittingDecision.set(decision);
    this.adminEvents
      .reviewEvent(event.id, { decision, ...(notes ? { notes } : {}) })
      .subscribe({
        next: (updated) => {
          this.submittingDecision.set(null);
          this.notice.set(
            decision === 'APPROVED'
              ? `"${updated.name}" was approved and is now visible to attendees.`
              : `"${updated.name}" was rejected. The organizer can revise and resubmit it.`,
          );
          this.closeReview();
        },
        error: (err: HttpErrorResponse) => {
          this.submittingDecision.set(null);
          this.reviewError.set(err.error?.message ?? 'Could not save the review. Please try again.');
        },
      });
  }
}
