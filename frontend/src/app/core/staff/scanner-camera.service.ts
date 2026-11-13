import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { IScannerControls } from '@zxing/browser';
import { ScannerDiagnosticsService } from './scanner-diagnostics.service';

export type CameraState =
  'idle' | 'starting' | 'active' | 'denied' | 'unavailable' | 'insecure' | 'error';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

@Injectable()
export class ScannerCameraController {
  private readonly diagnostics = inject(ScannerDiagnosticsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cameraState = signal<CameraState>('idle');
  readonly devices = signal<CameraDeviceOption[]>([]);
  readonly selectedDeviceId = signal<string | null>(null);
  readonly torchSupported = signal(false);
  readonly torchEnabled = signal(false);
  readonly cameraErrorMessage = signal('');

  private controls: IScannerControls | null = null;
  private activeVideoEl: HTMLVideoElement | null = null;
  private activeTrack: MediaStreamTrack | null = null;
  private destroyed = false;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stop();
    });
  }

  async start(
    videoEl: HTMLVideoElement | undefined,
    onDecode: (text: string) => void,
    preferredDeviceId?: string | null,
  ): Promise<void> {
    if (this.controls || this.cameraState() === 'starting') return;
    if (!videoEl) {
      this.diagnostics.warn('camera', 'Cannot start camera: video element not mounted.');
      return;
    }

    if (typeof window === 'undefined' || !window.isSecureContext) {
      this.cameraState.set('insecure');
      this.cameraErrorMessage.set('Camera requires HTTPS or localhost.');
      this.diagnostics.warn('camera', 'Blocked camera start due to insecure context.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraState.set('unavailable');
      this.cameraErrorMessage.set('Browser does not expose mediaDevices.getUserMedia.');
      this.diagnostics.warn('camera', 'Camera API unavailable in this browser.');
      return;
    }

    this.cameraState.set('starting');
    this.cameraErrorMessage.set('');
    this.activeVideoEl = videoEl;
    const deviceId = preferredDeviceId ?? this.selectedDeviceId();

    try {
      const { BrowserQRCodeReader } = await import('@zxing/browser');
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 200 });

      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' } };

      const controls = await reader.decodeFromConstraints(
        { audio: false, video: videoConstraints },
        videoEl,
        (decoded, err) => {
          if (decoded) {
            onDecode(decoded.getText());
          } else if (err && err.name !== 'NotFoundException') {
            this.diagnostics.debug('camera', 'Frame decode warning', {
              name: err.name,
              message: err.message,
            });
          }
        },
      );

      if (this.destroyed) {
        controls.stop();
        return;
      }

      this.controls = controls;
      this.cameraState.set('active');
      this.inspectActiveTrack(videoEl);
      await this.refreshDevices();

      this.diagnostics.info('camera', 'Camera stream started', {
        deviceId: this.selectedDeviceId(),
        torchSupported: this.torchSupported(),
      });
    } catch (err) {
      this.handleStartError(err);
    }
  }

  async switchDevice(
    videoEl: HTMLVideoElement | undefined,
    deviceId: string,
    onDecode: (text: string) => void,
  ): Promise<void> {
    if (!deviceId || deviceId === this.selectedDeviceId()) return;
    this.diagnostics.info('camera', 'Switching camera device', { deviceId });
    this.selectedDeviceId.set(deviceId);
    this.stop();
    await this.start(videoEl, onDecode, deviceId);
  }

  async toggleTorch(): Promise<boolean> {
    if (!this.activeTrack || !this.torchSupported()) {
      this.diagnostics.warn('torch', 'Torch toggle ignored: hardware unsupported or inactive.');
      return false;
    }

    const nextState = !this.torchEnabled();
    try {
      await this.activeTrack.applyConstraints({
        advanced: [{ torch: nextState } as unknown as MediaTrackConstraintSet],
      });
      this.torchEnabled.set(nextState);
      this.diagnostics.info('torch', `Torch turned ${nextState ? 'on' : 'off'}`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to toggle flashlight.';
      this.torchEnabled.set(false);
      this.diagnostics.error('torch', 'Failed to apply torch constraint', { message });
      return false;
    }
  }

  stop(): void {
    if (this.torchEnabled() && this.activeTrack) {
      this.activeTrack
        .applyConstraints({
          advanced: [{ torch: false } as unknown as MediaTrackConstraintSet],
        })
        .catch(() => undefined);
    }

    this.controls?.stop();
    this.controls = null;

    const stream = this.activeVideoEl?.srcObject as MediaStream | null | undefined;
    if (stream && typeof stream.getTracks === 'function') {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    if (this.activeVideoEl) {
      this.activeVideoEl.srcObject = null;
    }

    this.activeTrack = null;
    this.torchSupported.set(false);
    this.torchEnabled.set(false);

    if (!this.destroyed) {
      this.cameraState.set('idle');
    }
  }

  private inspectActiveTrack(videoEl: HTMLVideoElement): void {
    const stream = videoEl.srcObject as MediaStream | null | undefined;
    const track = stream?.getVideoTracks?.()[0] ?? null;
    this.activeTrack = track;

    if (!track) {
      this.torchSupported.set(false);
      this.torchEnabled.set(false);
      return;
    }

    const settings = track.getSettings?.();
    if (settings?.deviceId) {
      this.selectedDeviceId.set(settings.deviceId);
    }

    const capabilities = track.getCapabilities?.() as
      (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    const supportsTorch = Boolean(capabilities?.torch);
    this.torchSupported.set(supportsTorch);
    this.torchEnabled.set(false);
  }

  private async refreshDevices(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all
        .filter((d) => d.kind === 'videoinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${index + 1}`,
        }));
      this.devices.set(cameras);
    } catch (err) {
      this.diagnostics.warn('camera', 'Unable to enumerate video devices', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private handleStartError(err: unknown): void {
    const name = (err as { name?: string } | null)?.name ?? 'UnknownError';
    const message = (err as { message?: string } | null)?.message ?? '';

    this.diagnostics.error('camera', 'Camera failed to start', { name, message });

    if (
      name === 'NotAllowedError' ||
      name === 'SecurityError' ||
      name === 'PermissionDeniedError'
    ) {
      this.cameraState.set('denied');
      this.cameraErrorMessage.set('Camera permission was denied.');
    } else if (
      name === 'NotFoundError' ||
      name === 'OverconstrainedError' ||
      name === 'DevicesNotFoundError'
    ) {
      this.cameraState.set('unavailable');
      this.cameraErrorMessage.set('No matching camera device was found.');
    } else {
      this.cameraState.set('error');
      this.cameraErrorMessage.set(message || 'Could not start camera stream.');
    }
  }
}
