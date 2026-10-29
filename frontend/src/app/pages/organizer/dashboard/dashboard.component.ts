import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';

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
        event.venue.toLocaleLowerCase().includes(query) ||
        event.city.toLocaleLowerCase().includes(query);
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

  registrationProgress(registered: number, capacity: number): number {
    return capacity > 0 ? Math.min(registered / capacity, 1) : 0;
  }

  showEditNotice(eventName: string): void {
    this.notice.set(`Event editing for "${eventName}" is coming soon.`);
  }
}
