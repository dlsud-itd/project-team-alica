import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventCheckpoint, RecordScanResponse } from '../../../core/organizer/organizer.models';

export interface LocalScanItem extends RecordScanResponse {
  time: string;
}

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-event-scanner',
  styleUrl: './event-scanner.component.scss',
  templateUrl: './event-scanner.component.html',
})
export class EventScannerComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly organizerEvents = inject(OrganizerEventsService);
  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');

  readonly eventId = signal<string>('');
  readonly checkpoints = signal<EventCheckpoint[]>([]);
  readonly loadingCheckpoints = signal(true);
  readonly selectedStationId = signal<string>('');
  readonly activeStation = computed(() =>
    this.checkpoints().find((c) => c.id === this.selectedStationId()),
  );

  readonly manualCode = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  readonly isScanningCamera = signal(false);
  readonly cameraError = signal('');
  readonly processing = signal(false);
  readonly lastResult = signal<RecordScanResponse | null>(null);
  readonly recentStationScans = signal<LocalScanItem[]>([]);

  private codeReader: any = null;
  private cameraControls: any = null;
  private resultTimer: any = null;

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      parent.paramMap.subscribe((params) => {
        const id = params.get('eventId') ?? '';
        if (id) {
          this.eventId.set(id);
          this.loadStations();
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.stopCamera();
    if (this.resultTimer) {
      clearTimeout(this.resultTimer);
    }
  }

  loadStations(): void {
    const id = this.eventId();
    if (!id) return;

    this.loadingCheckpoints.set(true);
    this.organizerEvents.loadEventCheckpoints(id).subscribe({
      next: (stations) => {
        this.checkpoints.set(stations);
        this.loadingCheckpoints.set(false);
        if (stations.length > 0 && !this.selectedStationId()) {
          this.selectedStationId.set(stations[0].id);
        }
      },
      error: () => {
        this.loadingCheckpoints.set(false);
      },
    });
  }

  onSelectStation(event: globalThis.Event): void {
    const target = event.target as HTMLSelectElement;
    this.selectedStationId.set(target.value);
  }

  async startCamera(): Promise<void> {
    this.cameraError.set('');
    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      this.codeReader = new BrowserQRCodeReader();
      const videoEl = this.video()?.nativeElement;
      if (!videoEl) {
        this.cameraError.set('Video element not available.');
        return;
      }

      this.isScanningCamera.set(true);
      this.cameraControls = await this.codeReader.decodeFromVideoDevice(
        undefined,
        videoEl,
        (result: any) => {
          if (result && !this.processing()) {
            const text = result.getText();
            if (text) {
              this.submitScanCode(text);
            }
          }
        },
      );
    } catch {
      this.cameraError.set('Unable to access camera. Please verify camera permissions or use manual code entry.');
      this.isScanningCamera.set(false);
    }
  }

  stopCamera(): void {
    if (this.cameraControls) {
      this.cameraControls.stop();
      this.cameraControls = null;
    }
    this.isScanningCamera.set(false);
  }

  onManualSubmit(): void {
    const code = this.manualCode.value.trim();
    if (!code) return;
    this.submitScanCode(code);
    this.manualCode.setValue('');
  }

  submitScanCode(ticketCode: string): void {
    const eventId = this.eventId();
    const stationId = this.selectedStationId();
    if (!eventId || !stationId || this.processing()) return;

    this.processing.set(true);
    this.organizerEvents.recordScan(eventId, stationId, ticketCode).subscribe({
      next: (res) => {
        this.processing.set(false);
        this.lastResult.set(res);

        const item: LocalScanItem = {
          ...res,
          time: new Date().toLocaleTimeString('en-US', { hour12: true }),
        };
        this.recentStationScans.update((list) => [item, ...list.slice(0, 19)]);

        if (this.resultTimer) clearTimeout(this.resultTimer);
        this.resultTimer = setTimeout(() => {
          this.lastResult.set(null);
        }, 5000);
      },
      error: () => {
        this.processing.set(false);
      },
    });
  }

  dismissResult(): void {
    this.lastResult.set(null);
    if (this.resultTimer) clearTimeout(this.resultTimer);
  }
}
