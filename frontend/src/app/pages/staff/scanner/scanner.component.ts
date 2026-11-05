import { DatePipe } from '@angular/common';
import {
  Component,
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
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { IScannerControls } from '@zxing/browser';
import { ScannerApi } from '../../../core/staff/scanner-api';
import {
  CheckpointType,
  ScanOutcome,
  ScanResult,
  StaffCheckpoint,
} from '../../../core/staff/scanner.models';

/** A scan in the station feed, with the code as scanned (invalid tickets have no attendee). */
export type RecentScan = ScanOutcome & { ticketCode: string };

export type CameraState =
  'idle' | 'starting' | 'active' | 'denied' | 'unavailable' | 'insecure' | 'error';

const STATION_STORAGE_KEY = 'checkpoint.scanner.station';
const RECENT_LIMIT = 20;
/** Ignore the same code re-read by the camera within this window. */
const SAME_CODE_COOLDOWN_MS = 3000;
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
  selector: 'app-scanner',
  styleUrl: './scanner.component.scss',
  templateUrl: './scanner.component.html',
})
export class Scanner implements OnInit, OnDestroy {
  private readonly api = inject(ScannerApi);
  private readonly injector = inject(Injector);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  // Station
  readonly checkpoints = signal<StaffCheckpoint[]>([]);
  readonly loadingCheckpoints = signal(true);
  readonly loadError = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly station = computed(
    () => this.checkpoints().find((c) => c.id === this.selectedId()) ?? null,
  );

  // Camera
  readonly cameraState = signal<CameraState>('idle');
  private controls: IScannerControls | null = null;
  private destroyed = false;

  // Scanning
  readonly processing = signal(false);
  readonly result = signal<ScanOutcome | null>(null);
  readonly scanError = signal('');
  readonly recentScans = signal<RecentScan[]>([]);
  readonly manualCode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  private lastCode = '';
  private lastCodeAt = 0;
  private resultTimer: ReturnType<typeof setTimeout> | undefined;

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
    this.loadCheckpoints();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopCamera();
    clearTimeout(this.resultTimer);
    clearInterval(this.clock);
  }

  loadCheckpoints(): void {
    this.loadingCheckpoints.set(true);
    this.loadError.set('');

    this.api.getMyCheckpoints().subscribe({
      next: (checkpoints) => {
        this.checkpoints.set(checkpoints);
        const saved = localStorage.getItem(STATION_STORAGE_KEY);
        const initial = checkpoints.find((c) => c.id === saved) ?? checkpoints[0] ?? null;
        this.selectedId.set(initial?.id ?? null);
        this.loadingCheckpoints.set(false);

        if (initial) {
          // The <video> element only exists once the station view renders.
          afterNextRender(() => this.startCamera(), { injector: this.injector });
        }
      },
      error: () => {
        this.loadingCheckpoints.set(false);
        this.loadError.set(
          'Unable to load your assigned stations. Check your connection and retry.',
        );
      },
    });
  }

  selectStation(id: string): void {
    if (id === this.selectedId()) return;
    this.selectedId.set(id);
    localStorage.setItem(STATION_STORAGE_KEY, id);
    this.dismissResult();
    this.scanError.set('');
  }

  async startCamera(): Promise<void> {
    if (this.controls || this.cameraState() === 'starting') return;
    const videoEl = this.video()?.nativeElement;
    if (!videoEl) return;

    if (!window.isSecureContext) {
      this.cameraState.set('insecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraState.set('unavailable');
      return;
    }

    this.cameraState.set('starting');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200 });
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: 'environment' } } },
        videoEl,
        (decoded) => {
          if (decoded) this.onDecoded(decoded.getText());
        },
      );

      if (this.destroyed) {
        controls.stop();
        return;
      }
      this.controls = controls;
      this.cameraState.set('active');
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.cameraState.set('denied');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.cameraState.set('unavailable');
      } else {
        this.cameraState.set('error');
      }
    }
  }

  stopCamera(): void {
    this.controls?.stop();
    this.controls = null;
    if (!this.destroyed) this.cameraState.set('idle');
  }

  submitManual(): void {
    if (this.manualCode.invalid) return;
    this.submit(this.manualCode.value);
  }

  dismissResult(): void {
    clearTimeout(this.resultTimer);
    this.result.set(null);
  }

  private onDecoded(text: string): void {
    // Pause decoding while a scan is in flight or its result is on screen.
    if (this.processing() || this.result()) return;

    const code = text.trim();
    const now = Date.now();
    if (code === this.lastCode && now - this.lastCodeAt < SAME_CODE_COOLDOWN_MS) return;
    this.lastCode = code;
    this.lastCodeAt = now;

    this.submit(code);
  }

  private submit(rawCode: string): void {
    const station = this.station();
    const ticketCode = rawCode.trim().toUpperCase();
    if (!station || !ticketCode || this.processing()) return;

    this.dismissResult();
    this.scanError.set('');
    this.processing.set(true);

    this.api
      .scan(station.id, { ticketCode, deviceInfo: navigator.userAgent.slice(0, 120) })
      .subscribe({
        next: (outcome) => {
          this.processing.set(false);
          this.manualCode.reset();
          this.showResult({ ...outcome, ticketCode });
        },
        error: () => {
          this.processing.set(false);
          this.scanError.set('Scan could not be recorded. Check your connection and try again.');
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

  resultTitle(result: ScanResult): string {
    return RESULT_TITLES[result];
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
