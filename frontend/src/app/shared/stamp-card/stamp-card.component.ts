import { DatePipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { ProgressSummary, TicketStamp } from '../../core/attendee/attendee-progress.models';

/**
 * Event "passport": a progress bar of booths visited and, in full mode,
 * a grid of stamps (one per booth/session). Compact mode shows only the bar.
 */
@Component({
  selector: 'app-stamp-card',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './stamp-card.component.html',
  styleUrl: './stamp-card.component.scss',
})
export class StampCardComponent {
  readonly progress = input.required<ProgressSummary>();
  readonly stamps = input<TicketStamp[]>([]);
  readonly compact = input(false);
  /** Checkpoint id to highlight (e.g. the stamp just earned). */
  readonly highlightId = input<string | null>(null);

  readonly label = computed(() => {
    const p = this.progress();
    if (p.totalCount === 0) return 'No booths set up for this event yet';
    if (p.completed) return `All ${p.totalCount} booths visited!`;
    return `${p.visitedCount} of ${p.totalCount} booths visited`;
  });

  readonly barWidth = computed(() => `${Math.min(100, Math.max(0, this.progress().percent))}%`);
}
