import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  EventRegistrant,
  RegistrationStatus,
} from '../../../core/organizer/organizer.models';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';

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
  readonly event = computed(() => this.organizerEvents.eventById(this.eventId()));
  readonly loading = this.organizerEvents.loading;
  readonly loadError = this.organizerEvents.error;
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });
  readonly attendees = computed(() =>
    this.organizerEvents
      .registrants()
      .filter((registrant) => registrant.event_id === this.eventId())
      .filter((registrant) => {
        const query = this.searchText().trim().toLocaleLowerCase();
        return (
          !query ||
          registrant.full_name.toLocaleLowerCase().includes(query) ||
          registrant.email.toLocaleLowerCase().includes(query) ||
          registrant.ticket_id.toLocaleLowerCase().includes(query)
        );
      }),
  );
  readonly allEventAttendees = computed(() =>
    this.organizerEvents.registrants().filter((registrant) => registrant.event_id === this.eventId()),
  );
  readonly selectedRegistrant = signal<EventRegistrant | null>(null);

  readonly registeredCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Registered').length,
  );
  readonly checkedInCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Checked In').length,
  );

  toggleCheckIn(registrant: EventRegistrant): void {
    this.organizerEvents.toggleCheckIn(registrant.id);
  }

  reloadEvents(): void {
    this.organizerEvents.load();
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
