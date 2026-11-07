import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventLiveOverview, EventStaff, HourlyFlowPoint } from '../../../core/organizer/organizer.models';

@Component({
  imports: [DatePipe, DecimalPipe],
  selector: 'app-event-overview',
  styleUrl: './event-overview.component.scss',
  templateUrl: './event-overview.component.html',
})
export class EventOverviewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly organizerEvents = inject(OrganizerEventsService);

  readonly eventId = signal<string>('');
  readonly overview = signal<EventLiveOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly exporting = signal(false);

  // Staff Management
  readonly staffList = signal<EventStaff[]>([]);
  readonly staffLoading = signal(false);
  readonly staffError = signal('');
  readonly addingStaff = signal(false);

  private pollSub?: Subscription;

  // KPIs
  readonly kpis = computed(() => this.overview()?.kpis ?? {
    totalRsvps: 0,
    checkedInAttendees: 0,
    attendanceRate: 0,
    venueOccupancy: 0,
    maxCapacity: null,
    activeStationsCount: 0,
    totalVerifiedScans: 0,
  });

  // Flow rate points
  readonly hourlyFlow = computed(() => this.overview()?.hourlyFlow ?? []);

  // Station breakdown
  readonly stationTraffic = computed(() => this.overview()?.stationTraffic ?? []);

  // Recent scans
  readonly recentScans = computed(() => this.overview()?.recentScans ?? []);

  // SVG Chart calculation
  readonly chartSvgData = computed(() => {
    const flow = this.hourlyFlow();
    if (!flow || flow.length === 0) {
      return { path: '', area: '', points: [], maxScans: 0 };
    }

    const width = 600;
    const height = 160;
    const paddingX = 40;
    const paddingY = 24;

    const maxScans = Math.max(...flow.map((p) => p.scans), 4);
    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;

    const points = flow.map((item, index) => {
      const x = paddingX + (index / (flow.length - 1)) * usableWidth;
      const y = height - paddingY - (item.scans / maxScans) * usableHeight;
      return { x, y, scans: item.scans, hour: item.hour };
    });

    if (points.length === 0) return { path: '', area: '', points: [], maxScans };

    const path = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`, '');
    const first = points[0];
    const last = points[points.length - 1];
    const area = `${path} L ${last.x} ${height - paddingY} L ${first.x} ${height - paddingY} Z`;

    return { path, area, points, maxScans };
  });

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe((params) => {
        const id = params.get('eventId') ?? '';
        if (id) {
          this.eventId.set(id);
          this.fetchOverview();
          this.loadStaff(id);
        }
      });
    }

    // Gentle 15-second visibility-aware polling
    this.pollSub = interval(15000).subscribe(() => {
      if (document.visibilityState === 'visible' && this.eventId() && !this.loading()) {
        this.fetchOverview(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.pollSub?.unsubscribe();
  }

  fetchOverview(isPolling = false): void {
    const id = this.eventId();
    if (!id) return;

    if (!isPolling) {
      this.loading.set(true);
    }
    this.error.set('');

    this.organizerEvents.loadLiveOverview(id).subscribe({
      next: (data) => {
        this.overview.set(data);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        if (!isPolling) {
          this.error.set(err.error?.message || 'Could not load event overview metrics.');
        }
      },
    });
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
      error: () => {
        this.exporting.set(false);
      },
    });
  }

  loadStaff(id: string): void {
    this.staffLoading.set(true);
    this.organizerEvents.loadStaff(id).subscribe({
      next: (list) => {
        this.staffList.set(list);
        this.staffLoading.set(false);
      },
      error: () => {
        this.staffLoading.set(false);
      },
    });
  }

  addStaffMember(email: string): void {
    const cleanEmail = email?.trim();
    const id = this.eventId();
    if (!cleanEmail || !id) return;

    this.addingStaff.set(true);
    this.staffError.set('');
    this.organizerEvents.addStaff(id, cleanEmail).subscribe({
      next: () => {
        this.addingStaff.set(false);
        this.loadStaff(id);
      },
      error: (err) => {
        this.addingStaff.set(false);
        this.staffError.set(err?.error?.message || 'Failed to add staff member.');
      },
    });
  }

  removeStaffMember(userId: string): void {
    const id = this.eventId();
    if (!userId || !id) return;

    this.organizerEvents.removeStaff(id, userId).subscribe({
      next: () => {
        this.loadStaff(id);
      },
      error: () => undefined,
    });
  }

}