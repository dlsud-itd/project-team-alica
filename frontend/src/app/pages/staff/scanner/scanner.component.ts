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
import { safeGetStorageItem, safeSetStorageItem } from '../../../core/staff/safe-storage';
import { ScannerApi } from '../../../core/staff/scanner-api';
import { ScannerCameraController } from '../../../core/staff/scanner-camera.service';
import { ScannerDiagnosticsService } from '../../../core/staff/scanner-diagnostics.service';
import {
  CheckpointType,
  ScanOutcome,
  ScanResult,
  StaffCheckpoint,
} from '../../../core/staff/scanner.models';

/** A scan in the station feed, with the code as scanned (invalid tickets have no attendee). */
export type RecentScan = ScanOutcome & { ticketCode: string };

export type { CameraState } from '../../../core/staff/scanner-camera.service';

export interface StationOption {
  checkpoint: StaffCheckpoint;
  label: string;
  isSubBooth: boolean;
}

const STATION_STORAGE_KEY = 'checkpoint.scanner.station';
const RECENT_LIMIT = 20;
/** Ignore the same code re-read by the camera within this window. */
export const SAME_CODE_COOLDOWN_MS = 3000;
const RESULT_DISMISS_MS: Record<ScanResult, number> = {
  SUCCESS: 2500,
  DUPLICATE: 5000,
  WARNING_NO_MAIN_ENTRY: 5000,
  INVALID_TICKET: 4000,
};

const RESULT_TITLES: Record<ScanResult, string> = {
  SUCCESS: 'Checked in',
  DUPLICATE: 'Already checked in',
  WARNING_NO_MAIN_ENTRY: 'No main entry yet',
  INVALID_TICKET: 'Invalid ticket',
};

const RESULT_TONES: Record<ScanResult, 'success' | 'danger' | 'warning'> = {
  SUCCESS: 'success',
  DUPLICATE: 'danger',
  WARNING_NO_MAIN_ENTRY: 'warning',
  INVALID_TICKET: 'danger',
};

const CHECKPOINT_TYPE_LABELS: Record<CheckpointType, string> = {
  MAIN_ENTRY: 'Main entry',
  SESSION: 'Session',
  BOOTH: 'Booth',
  EXIT: 'Exit',
};

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  providers: [ScannerCameraController],
  selector: 'app-scanner',
  styleUrl: './scanner.component.scss',
  templateUrl: './scanner.component.html',
})
export class Scanner implements OnInit, OnDestroy {
  private readonly api = inject(ScannerApi);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  readonly camera = inject(ScannerCameraController);
  readonly diagnostics = inject(ScannerDiagnosticsService);

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  // Station & Routing
  readonly checkpoints = signal<StaffCheckpoint[]>([]);
  readonly loadingCheckpoints = signal(true);
  readonly loadError = signal('');
  readonly routeBoothId = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);
  readonly station = computed(
    () => this.checkpoints().find((c) => c.id === this.selectedId()) ?? null,
  );
  readonly parentStationName = computed(() => {
    const current = this.station();
    if (!current?.parentId) return null;
    return this.checkpoints().find((c) => c.id === current.parentId)?.name ?? null;
  });
  readonly stationOptions = computed<StationOption[]>(() => {
    const list = this.checkpoints();
    const byId = new Set(list.map((c) => c.id));
    const roots = list.filter((c) => !c.parentId || !byId.has(c.parentId));
    const options: StationOption[] = [];

    for (const root of roots) {
      options.push({
        checkpoint: root,
        label: `${root.name} (${this.typeLabel(root.type)})`,
        isSubBooth: false,
      });
      const children = list.filter((c) => c.parentId === root.id);
      for (const child of children) {
        options.push({
          checkpoint: child,
          label: `↳ ${child.name}`,
          isSubBooth: true,
        });
      }
    }
    return options;
  });

  // Camera aliases for reactive bindings & backwards-compatible inspection
  readonly cameraState = this.camera.cameraState;
  readonly torchSupported = this.camera.torchSupported;
  readonly torchEnabled = this.camera.torchEnabled;
  readonly cameraDevices = this.camera.devices;
  readonly selectedCameraId = this.camera.selectedDeviceId;

  // Scanning & Debounce
  readonly processing = signal(false);
  readonly result = signal<ScanOutcome | null>(null);
  readonly scanError = signal('');
  readonly debounceNotice = signal('');
  readonly recentScans = signal<RecentScan[]>([]);
  readonly showDiagnostics = signal(false);
  readonly manualCode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  private lastCode = '';
  private lastCodeAt = 0;
  private resultTimer: ReturnType<typeof setTimeout> | undefined;
  private debounceNoticeTimer: ReturnType<typeof setTimeout> | undefined;

  // Relative timestamps in the recent feed
  readonly now = signal(Date.now());
  private clock: ReturnType<typeof setInterval> | undefined;

  readonly stationScans = computed(() =>
    this.recentScans().filter((s) => s.checkpoint.id === this.selectedId()),
  );
  readonly admittedCount = computed(
    () => this.stationScans().filter((s) => s.scanResult === 'SUCCESS').length,
  );
  readonly flaggedCount = computed(
    () => this.stationScans().filter((s) => s.scanResult !== 'SUCCESS').length,
  );

  ngOnInit(): void {
    this.clock = setInterval(() => this.now.set(Date.now()), 15000);
    this.bindRouteParams();
    this.loadCheckpoints();
  }

  ngOnDestroy(): void {
    this.camera.stop();
    clearTimeout(this.resultTimer);
    clearTimeout(this.debounceNoticeTimer);
    clearInterval(this.clock);
  }

  private bindRouteParams(): void {
    if (!this.route) return;
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([params, query]) => {
        const boothId = params.get('boothId') ?? query.get('boothId');
        this.routeBoothId.set(boothId);
        if (boothId && this.checkpoints().some((c) => c.id === boothId)) {
          this.applyStationSelection(boothId, false);
        }
      });
  }

  loadCheckpoints(): void {
    this.loadingCheckpoints.set(true);
    this.loadError.set('');

    this.api
      .getMyCheckpoints()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (checkpoints) => {
          this.checkpoints.set(checkpoints);
          const requestedId = this.routeBoothId();
          const saved = safeGetStorageItem(STATION_STORAGE_KEY);
          const initial =
            checkpoints.find((c) => c.id === requestedId) ??
            checkpoints.find((c) => c.id === saved) ??
            checkpoints[0] ??
            null;

          if (requestedId && initial && initial.id !== requestedId) {
            this.diagnostics.warn(
              'routing',
              'Requested boothId not assigned; fell back to default.',
              {
                requestedBoothId: requestedId,
                selectedBoothId: initial.id,
              },
            );
          }

          this.selectedId.set(initial?.id ?? null);
          if (initial) {
            safeSetStorageItem(STATION_STORAGE_KEY, initial.id);
            this.diagnostics.info('station', 'Active station resolved', {
              boothId: initial.id,
              name: initial.name,
              type: initial.type,
              cooldownSeconds: initial.cooldownSeconds ?? 0,
            });
          }

          this.loadingCheckpoints.set(false);

          if (initial) {
            // The <video> element only exists once the station view renders.
            afterNextRender(() => this.startCamera(), { injector: this.injector });
          }
        },
        error: (err: unknown) => {
          this.loadingCheckpoints.set(false);
          this.loadError.set(
            'Unable to load your assigned stations. Check your connection and retry.',
          );
          this.diagnostics.error('station', 'Failed to load assigned checkpoints', {
            error: err instanceof Error ? err.message : String(err),
          });
        },
      });
  }

  selectStation(id: string): void {
    if (id === this.selectedId()) return;
    this.applyStationSelection(id, true);
  }

  private applyStationSelection(id: string, syncUrl: boolean): void {
    if (!this.checkpoints().some((c) => c.id === id)) return;
    this.selectedId.set(id);
    safeSetStorageItem(STATION_STORAGE_KEY, id);
    this.dismissResult();
    this.scanError.set('');
    this.debounceNotice.set('');
    // Reset local debounce lock when switching booths so the same attendee can be scanned immediately.
    this.lastCode = '';
    this.lastCodeAt = 0;

    this.diagnostics.info('routing', 'Switched active station', { boothId: id });

    if (syncUrl && this.router && this.router.url.startsWith('/staff/scanner')) {
      void this.router.navigate(['/staff/scanner', id], { replaceUrl: true });
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

  submitManual(): void {
    if (this.manualCode.invalid) return;
    this.submit(this.manualCode.value);
  }

  dismissResult(): void {
    clearTimeout(this.resultTimer);
    this.result.set(null);
  }

  toggleDiagnostics(): void {
    this.showDiagnostics.update((v) => !v);
  }

  private onDecoded(text: string): void {
    // Pause decoding while a scan is in flight or its result is on screen.
    if (this.processing() || this.result()) return;

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
        remainingMs: SAME_CODE_COOLDOWN_MS - (now - this.lastCodeAt),
      });
      return;
    }

    this.lastCode = code;
    this.lastCodeAt = now;
    this.debounceNotice.set('');
    this.submit(code);
  }

  private submit(rawCode: string): void {
    const station = this.station();
    const ticketCode = rawCode.trim().toUpperCase();
    if (!station) {
      this.scanError.set('No station assigned or selected.');
      return;
    }
    if (!ticketCode || this.processing()) return;

    this.dismissResult();
    this.scanError.set('');
    this.processing.set(true);

    this.api
      .scan(station.id, { ticketCode, deviceInfo: navigator.userAgent.slice(0, 120) })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (outcome) => {
          this.processing.set(false);
          this.manualCode.reset();
          this.diagnostics.info('api', 'Scan evaluated', {
            boothId: station.id,
            ticketCode,
            scanResult: outcome.scanResult,
            cooldownActive: outcome.cooldownActive ?? false,
          });
          this.showResult({ ...outcome, ticketCode });
        },
        error: (err: unknown) => {
          this.processing.set(false);
          this.scanError.set('Scan could not be recorded. Check your connection and try again.');
          this.diagnostics.error('api', 'Scan request errored', {
            boothId: station.id,
            ticketCode,
            error: err instanceof Error ? err.message : String(err),
          });
        },
      });
  }

  private showResult(outcome: RecentScan): void {
    this.result.set(outcome);
    this.recentScans.update((list) => [outcome, ...list].slice(0, RECENT_LIMIT));
    this.now.set(Date.now());
    navigator.vibrate?.(outcome.scanResult === 'SUCCESS' ? 80 : [80, 60, 80]);
    this.resultTimer = setTimeout(
      () => this.result.set(null),
      RESULT_DISMISS_MS[outcome.scanResult],
    );
  }

  resultTitle(outcome: ScanOutcome): string {
    if (outcome.scanResult === 'DUPLICATE' && outcome.cooldownActive) {
      return 'Cooldown active';
    }
    return RESULT_TITLES[outcome.scanResult];
  }

  resultTone(result: ScanResult): 'success' | 'danger' | 'warning' {
    return RESULT_TONES[result];
  }

  typeLabel(type: CheckpointType): string {
    return CHECKPOINT_TYPE_LABELS[type];
  }

  relativeTime(iso: string): string {
    const seconds = Math.max(0, Math.round((this.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 45) return 'Just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return `${hours} hr ago`;
  }
}
