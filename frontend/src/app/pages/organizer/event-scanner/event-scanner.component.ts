import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest } from 'rxjs';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventCheckpoint, RecordScanResponse } from '../../../core/organizer/organizer.models';
import { safeGetStorageItem, safeSetStorageItem } from '../../../core/staff/safe-storage';
import { ScannerCameraController } from '../../../core/staff/scanner-camera.service';
import { ScannerDiagnosticsService } from '../../../core/staff/scanner-diagnostics.service';

export interface LocalScanItem extends RecordScanResponse {
  time: string;
}

export interface OrganizerStationOption {
  checkpoint: EventCheckpoint;
  label: string;
  isSubBooth: boolean;
}

const SAME_CODE_COOLDOWN_MS = 3000;

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  providers: [ScannerCameraController],
  selector: 'app-event-scanner',
  styleUrl: './event-scanner.component.scss',
  templateUrl: './event-scanner.component.html',
})
export class EventScannerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router, { optional: true });
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly organizerEvents = inject(OrganizerEventsService);
  readonly camera = inject(ScannerCameraController);
  readonly diagnostics = inject(ScannerDiagnosticsService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly eventId = signal<string>('');
  readonly checkpoints = signal<EventCheckpoint[]>([]);
  readonly loadingCheckpoints = signal(true);
  readonly loadError = signal('');
  readonly routeBoothId = signal<string | null>(null);
  readonly selectedStationId = signal<string>('');
  readonly activeStation = computed(() =>
    this.checkpoints().find((c) => c.id === this.selectedStationId()),
  );
  readonly stationOptions = computed<OrganizerStationOption[]>(() => {
    const list = this.checkpoints();
    const byId = new Set(list.map((c) => c.id));
    const roots = list.filter((c) => !c.parentId || !byId.has(c.parentId));
    const options: OrganizerStationOption[] = [];

    for (const root of roots) {
      options.push({
        checkpoint: root,
        label: `${root.name} (${root.type})`,
        isSubBooth: false,
      });
      for (const child of list.filter((c) => c.parentId === root.id)) {
        options.push({
          checkpoint: child,
          label: `↳ ${child.name}`,
          isSubBooth: true,
        });
      }
    }
    return options;
  });

  readonly manualCode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly cameraState = this.camera.cameraState;
  readonly isScanningCamera = computed(() => this.camera.cameraState() === 'active');
  readonly cameraError = this.camera.cameraErrorMessage;
  readonly torchSupported = this.camera.torchSupported;
  readonly torchEnabled = this.camera.torchEnabled;
  readonly cameraDevices = this.camera.devices;
  readonly selectedCameraId = this.camera.selectedDeviceId;

  readonly processing = signal(false);
  readonly scanError = signal('');
  readonly debounceNotice = signal('');
  readonly lastResult = signal<RecordScanResponse | null>(null);
  readonly recentStationScans = signal<LocalScanItem[]>([]);
  readonly showDiagnostics = signal(false);

  private lastCode = '';
  private lastCodeAt = 0;
  private resultTimer: ReturnType<typeof setTimeout> | undefined;
  private debounceNoticeTimer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      combineLatest([parent.paramMap, this.route.paramMap, this.route.queryParamMap])
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(([parentParams, params, query]) => {
          const eventId = parentParams.get('eventId') ?? '';
          const boothId = params.get('boothId') ?? query.get('boothId');
          this.routeBoothId.set(boothId);

          if (eventId && eventId !== this.eventId()) {
            this.eventId.set(eventId);
            this.loadStations();
          } else if (boothId && this.checkpoints().some((c) => c.id === boothId)) {
            this.applyStationSelection(boothId, false);
          }
        });
    }
  }

  ngOnDestroy(): void {
    this.camera.stop();
    clearTimeout(this.resultTimer);
    clearTimeout(this.debounceNoticeTimer);
  }

  loadStations(): void {
    const id = this.eventId();
    if (!id) return;

    this.loadingCheckpoints.set(true);
    this.loadError.set('');

    this.organizerEvents
      .loadEventCheckpoints(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stations) => {
          this.checkpoints.set(stations);
          this.loadingCheckpoints.set(false);

          const requested = this.routeBoothId();
          const saved = safeGetStorageItem(this.storageKey(id));
          const initial =
            stations.find((s) => s.id === requested) ??
            stations.find((s) => s.id === saved) ??
            stations[0] ??
            null;

          if (initial) {
            this.selectedStationId.set(initial.id);
            safeSetStorageItem(this.storageKey(id), initial.id);
            this.diagnostics.info('station', 'Organizer station resolved', {
              eventId: id,
              boothId: initial.id,
              name: initial.name,
            });
            afterNextRender(() => void this.startCamera(), { injector: this.injector });
          } else {
            this.selectedStationId.set('');
          }
        },
        error: (err: unknown) => {
          this.loadingCheckpoints.set(false);
          this.loadError.set('Unable to load event stations. Please retry.');
          this.diagnostics.error('station', 'Failed to load event checkpoints', {
            eventId: id,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      });
  }

  onSelectStation(event: globalThis.Event): void {
    const target = event.target as HTMLSelectElement;
    if (target.value) {
      this.applyStationSelection(target.value, true);
    }
  }

  selectStation(boothId: string): void {
    this.applyStationSelection(boothId, true);
  }

  private applyStationSelection(boothId: string, syncUrl: boolean): void {
    if (!this.checkpoints().some((c) => c.id === boothId)) return;
    if (boothId === this.selectedStationId()) return;

    this.selectedStationId.set(boothId);
    const id = this.eventId();
    if (id) {
      safeSetStorageItem(this.storageKey(id), boothId);
    }

    this.dismissResult();
    this.scanError.set('');
    this.debounceNotice.set('');
    this.lastCode = '';
    this.lastCodeAt = 0;

    this.diagnostics.info('routing', 'Switched event scanner station', {
      eventId: id,
      boothId,
    });

    if (syncUrl && this.router && id) {
      const basePrefix = this.router.url.startsWith('/staff/') ? '/staff' : '/organizer';
      if (this.router.url.includes(`/events/${id}/scanner`)) {
        void this.router.navigate([basePrefix, 'events', id, 'scanner', boothId], {
          replaceUrl: true,
        });
      }
    }
  }

  async startCamera(): Promise<void> {
    await this.camera.start(this.video()?.nativeElement, (code) => this.onDecoded(code));
  }

  stopCamera(): void {
    this.camera.stop();
  }

  async switchCamera(deviceId: string): Promise<void> {
    await this.camera.switchDevice(this.video()?.nativeElement, deviceId, (code) =>
      this.onDecoded(code),
    );
  }

  async toggleTorch(): Promise<void> {
    await this.camera.toggleTorch();
  }

  onManualSubmit(): void {
    const code = this.manualCode.value.trim();
    if (!code) return;
    this.submitScanCode(code);
    this.manualCode.setValue('');
  }

  private onDecoded(text: string): void {
    if (this.processing() || this.lastResult()) return;

    const code = text.trim();
    if (!code) return;

    const now = Date.now();
    if (code === this.lastCode && now - this.lastCodeAt < SAME_CODE_COOLDOWN_MS) {
      const waitSec = Math.ceil((SAME_CODE_COOLDOWN_MS - (now - this.lastCodeAt)) / 1000);
      this.debounceNotice.set(`Same QR pass held in ${waitSec}s scan lock.`);
      clearTimeout(this.debounceNoticeTimer);
      this.debounceNoticeTimer = setTimeout(() => this.debounceNotice.set(''), 1500);
      this.diagnostics.debug('debounce', 'Ignored duplicate camera frame within debounce window', {
        ticketCode: code,
      });
      return;
    }

    this.lastCode = code;
    this.lastCodeAt = now;
    this.debounceNotice.set('');
    this.submitScanCode(code);
  }

  submitScanCode(ticketCode: string): void {
    const eventId = this.eventId();
    const stationId = this.selectedStationId();
    const cleanCode = ticketCode.trim();

    if (!eventId) {
      this.scanError.set('No event selected. Please navigate to an event scanner.');
      return;
    }
    if (!stationId) {
      this.scanError.set('Please select an active station/gate first.');
      return;
    }
    if (!cleanCode || this.processing()) return;

    this.scanError.set('');
    this.processing.set(true);

    this.organizerEvents
      .recordScan(eventId, stationId, cleanCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.processing.set(false);
          this.lastResult.set(res);

          this.diagnostics.info('api', 'Event scan recorded', {
            eventId,
            boothId: stationId,
            ticketCode: res.ticketCode,
            scanResult: res.scanResult,
            cooldownActive: res.cooldownActive ?? false,
          });

          const item: LocalScanItem = {
            ...res,
            time: new Date().toLocaleTimeString('en-US', { hour12: true }),
          };
          this.recentStationScans.update((list) => [item, ...list.slice(0, 19)]);

          clearTimeout(this.resultTimer);
          this.resultTimer = setTimeout(() => {
            this.lastResult.set(null);
          }, 5000);
        },
        error: (err: unknown) => {
          this.processing.set(false);
          this.scanError.set('Unable to record scan. Check your connection and try again.');
          this.diagnostics.error('api', 'Event scan request failed', {
            eventId,
            boothId: stationId,
            ticketCode: cleanCode,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      });
  }

  dismissResult(): void {
    this.lastResult.set(null);
    clearTimeout(this.resultTimer);
  }

  toggleDiagnostics(): void {
    this.showDiagnostics.update((v) => !v);
  }

  private storageKey(eventId: string): string {
    return `checkpoint.event-scanner.${eventId}.station`;
  }
}
