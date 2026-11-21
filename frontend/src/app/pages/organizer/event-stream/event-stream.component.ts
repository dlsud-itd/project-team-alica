import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { RecentScanItem } from '../../../core/organizer/organizer.models';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';
import { EventStatsComponent } from '../event-stats/event-stats.component';

const PAGE_SIZE = 100;

@Component({
  imports: [DatePipe, EventStatsComponent],
  selector: 'app-event-stream',
  styleUrls: ['../event-stats/event-stats.component.scss', './event-stream.component.scss'],
  templateUrl: './event-stream.component.html',
})
export class EventStreamComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly organizerEvents = inject(OrganizerEventsService);
  private readonly stationsApi = inject(SubBoothApi);

  readonly statusOptions = [
    { value: '', label: 'All results' },
    { value: 'SUCCESS', label: 'Checked in' },
    { value: 'DUPLICATE', label: 'Duplicate' },
    { value: 'WARNING_NO_MAIN_ENTRY', label: 'No main entry' },
    { value: 'INVALID_TICKET', label: 'Invalid ticket' },
  ];

  readonly eventId = signal('');
  readonly scans = signal<RecentScanItem[]>([]);
  readonly stations = signal<StaffCheckpoint[]>([]);
  readonly stationFilter = signal('');
  readonly statusFilter = signal('');
  readonly limit = signal(PAGE_SIZE);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly exporting = signal(false);

  /** Stations in picker order: each sub-booth right after its parent. */
  readonly stationOptions = computed(() => {
    const list = this.stations();
    const ids = new Set(list.map((c) => c.id));
    const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId));
    return roots.flatMap((root) => [
      { id: root.id, label: root.name },
      ...list.filter((c) => c.parentId === root.id).map((c) => ({ id: c.id, label: `↳ ${c.name}` })),
    ]);
  });

  /** True when the last load filled the page, so older scans may exist. */
  readonly canLoadMore = computed(() => this.scans().length >= this.limit() && this.limit() < 500);

  private pollSub?: Subscription;

  ngOnInit(): void {
    this.route.parent?.paramMap.subscribe((params) => {
      const id = params.get('eventId') ?? '';
      if (!id) return;
      this.eventId.set(id);
      this.loadScans();
      this.stationsApi.listByEvent(id).subscribe({
        next: (list) => this.stations.set(list),
        error: () => undefined,
      });
    });

    this.pollSub = interval(15000).subscribe(() => {
      if (document.visibilityState === 'visible' && this.eventId()) {
        this.loadScans(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  loadScans(isPolling = false): void {
    const id = this.eventId();
    if (!id) return;
    if (!isPolling) this.loading.set(true);

    this.organizerEvents
      .listScans(id, {
        stationId: this.stationFilter() || undefined,
        status: this.statusFilter() || undefined,
        limit: this.limit(),
      })
      .subscribe({
        next: (list) => {
          this.scans.set(list);
          this.loading.set(false);
          this.error.set('');
        },
        error: (err: { error?: { message?: string } }) => {
          this.loading.set(false);
          if (!isPolling) this.error.set(err.error?.message || 'Could not load the scan stream.');
        },
      });
  }

  setStation(id: string): void {
    this.stationFilter.set(id);
    this.limit.set(PAGE_SIZE);
    this.loadScans();
  }

  setStatus(status: string): void {
    this.statusFilter.set(status);
    this.limit.set(PAGE_SIZE);
    this.loadScans();
  }

  loadMore(): void {
    this.limit.set(Math.min(this.limit() + PAGE_SIZE * 2, 500));
    this.loadScans();
  }

  exportCsv(): void {
    const id = this.eventId();
    if (!id || this.exporting()) return;

    this.exporting.set(true);
    this.organizerEvents.exportScansCsv(id).subscribe({
      next: (csvData) => {
        this.exporting.set(false);
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `checkin-stream-${id}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      error: () => this.exporting.set(false),
    });
  }
}
