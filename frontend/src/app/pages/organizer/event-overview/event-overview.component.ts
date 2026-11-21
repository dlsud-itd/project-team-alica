import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventDetailsComponent } from '../../public/event-details/event-details.component';

/**
 * Overview tab: the event page exactly as attendees see it, so organizers can
 * check its layout and content. Live numbers are in the Stream tab.
 */
@Component({
  imports: [RouterLink, EventDetailsComponent],
  selector: 'app-event-overview',
  styleUrl: './event-overview.component.scss',
  templateUrl: './event-overview.component.html',
})
export class EventOverviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly organizerEvents = inject(OrganizerEventsService);

  readonly eventId = signal('');

  /** Organizers get shortcuts to edit what the page shows. */
  readonly canEdit = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'ORGANIZER') return true;
    const ev = this.organizerEvents.events().find((e) => e.id === this.eventId());
    return !!ev && (ev.organizer_id === user.id || !!ev.organizers?.some((o) => o.userId === user.id));
  });

  ngOnInit(): void {
    this.route.parent?.paramMap.subscribe((params) => {
      this.eventId.set(params.get('eventId') ?? '');
    });
  }
}
