import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventLiveOverview, EventStaff, HourlyFlowPoint } from '../../../core/organizer/organizer.models';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';

@Component({
  imports: [DatePipe, DecimalPipe],
  selector: 'app-event-overview',
  styleUrl: './event-overview.component.scss',
  templateUrl: './event-overview.component.html',
})
export class EventOverviewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly organizerEvents = inject(OrganizerEventsService);
  private readonly subBoothApi = inject(SubBoothApi);

  readonly eventId = signal<string>('');
  readonly overview = signal<EventLiveOverview | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly exporting = signal(false);

  // Sub-booth state
  readonly checkpoints = signal<StaffCheckpoint[]>([]);
  readonly addingFor = signal<string | null>(null);
  readonly subName = signal('');
  readonly subLocation = signal('');
  readonly savingSub = signal(false);
  readonly subError = signal('');

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

  // Ids of top-level booths (only these can receive sub-booths)
  readonly boothIds = computed(
    () =>
      new Set(
        this.checkpoints()
          .filter((c) => c.type === 'BOOTH' && !c.parentId)
          .map((c) => c.id),
      ),
  );

  readonly canManageSubBooths = computed(() => {
    const user = this.auth.user();
    const organizerId = this.overview()?.organizerId;
    if (!user) return true;
    if (user.role === 'ADMIN') return true;
    if (organizerId) return organizerId === user.id;
    return user.role === 'ORGANIZER';
  });

  // Map of sub-booth id -> parent booth id
  readonly parentOf = computed(
    () =>
      new Map(
        this.checkpoints()
          .filter((c) => !!c.parentId)
          .map((c) => [c.id, c.parentId as string] as [string, string]),
      ),
  );

  // Station list with each sub-booth placed right under its parent booth
  readonly orderedStations = computed(() => {
    const stations = this.stationTraffic();
    const parentOf = this.parentOf();
    const ids = new Set(stations.map((s) => s.id));
    const childrenByParent = new Map<string, (typeof stations)[number][]>();
    const topLevel: (typeof stations)[number][] = [];

    for (const station of stations) {
      const parentId = parentOf.get(station.id);
      if (parentId && ids.has(parentId)) {
        const list = childrenByParent.get(parentId) ?? [];
        list.push(station);
        childrenByParent.set(parentId, list);
      } else {
        topLevel.push(station);
      }
    }

    return topLevel.flatMap((station) => [station, ...(childrenByParent.get(station.id) ?? [])]);
  });

  // Scans and count of sub-booths, grouped by parent booth
  readonly subTotals = computed(() => {
    const totals = new Map<string, { scans: number; count: number }>();
    const parentOf = this.parentOf();
    for (const station of this.stationTraffic()) {
      const parentId = parentOf.get(station.id);
      if (!parentId) continue;
      const entry = totals.get(parentId) ?? { scans: 0, count: 0 };
      entry.scans += station.scans;
      entry.count += 1;
      totals.set(parentId, entry);
    }
    return totals;
  });

  subTotalFor(stationId: string): { scans: number; count: number } | null {
    return this.subTotals().get(stationId) ?? null;
  }

  // Recent scans
  readonly recentScans = computed(() => this.overview()?.recentScans ?? []);

  // Sub-booth detail panel
  readonly selectedSubId = signal<string | null>(null);

  readonly selectedSub = computed(() => {
    const id = this.selectedSubId();
    if (!id) return null;

    const station = this.stationTraffic().find((s) => s.id === id);
    if (!station) return null;

    const parentId = this.parentOf().get(id);
    const parentStation = this.stationTraffic().find((s) => s.id === parentId);
    const parentName =
      parentStation?.name ?? this.checkpoints().find((c) => c.id === parentId)?.name ?? 'Booth';
    const parentScans = parentStation?.scans ?? 0;
    const scans = this.recentScans().filter((scan) => scan.stationName === station.name);
    const totalWithParent = parentScans + station.scans;

    return {
      station,
      parentName,
      parentScans,
      share: totalWithParent > 0 ? Math.round((station.scans / totalWithParent) * 100) : 0,
      scans,
    };
  });

  openSubDetail(stationId: string): void {
    this.selectedSubId.set(stationId);
  }

  closeSubDetail(): void {
    this.selectedSubId.set(null);
  }

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
          this.loadCheckpoints();
          this.loadStaff(id);
        }
      });
    }

    // Gentle 15-second visibility-aware polling
    this.pollSub = interval(15000).subscribe(() => {
      if (document.visibilityState === 'visible' && this.eventId() && !this.loading()) {
        this.fetchOverview(true);
        this.loadCheckpoints();
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

  // ---- Sub-booths ----

  private loadCheckpoints(): void {
    const id = this.eventId();
    if (!id) return;

    this.subBoothApi.listByEvent(id).subscribe({
      next: (list) => {
        this.checkpoints.set(list);
      },
      error: () => undefined,
    });
  }

  canAddSubBooth(stationId: string): boolean {
    return this.canManageSubBooths() && this.boothIds().has(stationId);
  }

  isSubBooth(stationId: string): boolean {
    return this.parentOf().has(stationId);
  }

  openSubBoothForm(stationId: string): void {
    this.addingFor.set(stationId);
    this.subName.set('');
    this.subLocation.set('');
    this.subError.set('');
  }

  cancelSubBooth(): void {
    this.addingFor.set(null);
    this.subName.set('');
    this.subLocation.set('');
    this.subError.set('');
  }

  submitSubBooth(event: Event): void {
    event.preventDefault();

    const parentId = this.addingFor();
    const name = this.subName().trim();
    if (!parentId || this.savingSub()) return;

    if (!name) {
      this.subError.set('Please enter a sub-booth name.');
      return;
    }

    this.savingSub.set(true);
    this.subError.set('');

    this.subBoothApi
      .create(parentId, { name, location: this.subLocation().trim() || undefined })
      .subscribe({
        next: () => {
          this.savingSub.set(false);
          this.cancelSubBooth();
          this.loadCheckpoints();
          this.fetchOverview(true);
        },
        error: (err: { error?: { message?: string } }) => {
          this.savingSub.set(false);
          this.subError.set(err.error?.message || 'Could not add the sub-booth.');
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