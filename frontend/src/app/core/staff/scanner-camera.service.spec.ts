import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ScannerCameraController } from './scanner-camera.service';
import { ScannerDiagnosticsService } from './scanner-diagnostics.service';

@Component({
  template: '',
  providers: [ScannerCameraController],
})
class HostComponent {}

describe('ScannerCameraController', () => {
  let controller: ScannerCameraController;
  let diagnostics: ScannerDiagnosticsService;

  let originalSecureContext: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalSecureContext = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    TestBed.configureTestingModule({
      imports: [HostComponent],
    });
    const fixture = TestBed.createComponent(HostComponent);
    controller = fixture.debugElement.injector.get(ScannerCameraController);
    diagnostics = TestBed.inject(ScannerDiagnosticsService);
    diagnostics.clear();
  });

  afterEach(() => {
    if (originalSecureContext) {
      Object.defineProperty(window, 'isSecureContext', originalSecureContext);
    } else {
      delete (window as unknown as Record<string, unknown>)['isSecureContext'];
    }
    vi.restoreAllMocks();
  });

  it('sets cameraState to insecure when window.isSecureContext is false', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    });
    const video = document.createElement('video');

    await controller.start(video, vi.fn());

    expect(controller.cameraState()).toBe('insecure');
    expect(diagnostics.entries()[0]?.category).toBe('camera');
  });

  it('sets cameraState to unavailable when mediaDevices.getUserMedia is missing', async () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    const originalMedia = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });

    const video = document.createElement('video');
    await controller.start(video, vi.fn());

    expect(controller.cameraState()).toBe('unavailable');

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMedia,
    });
  });

  it('returns false when toggling torch without hardware support', async () => {
    const toggled = await controller.toggleTorch();
    expect(toggled).toBe(false);
    expect(controller.torchEnabled()).toBe(false);
    expect(diagnostics.entries()[0]?.category).toBe('torch');
  });

  it('toggles torch when active track supports torch capability', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const mockTrack = {
      applyConstraints,
      getCapabilities: () => ({ torch: true }),
      getSettings: () => ({ deviceId: 'cam-back' }),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    const video = document.createElement('video');
    Object.defineProperty(video, 'srcObject', {
      configurable: true,
      writable: true,
      value: {
        getVideoTracks: () => [mockTrack],
        getTracks: () => [mockTrack],
      },
    });

    // Simulate active track inspection directly via private helper
    (
      controller as unknown as { inspectActiveTrack: (el: HTMLVideoElement) => void }
    ).inspectActiveTrack(video);

    expect(controller.torchSupported()).toBe(true);
    expect(controller.selectedDeviceId()).toBe('cam-back');

    const on = await controller.toggleTorch();
    expect(on).toBe(true);
    expect(controller.torchEnabled()).toBe(true);
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ torch: true }],
    });

    const off = await controller.toggleTorch();
    expect(off).toBe(true);
    expect(controller.torchEnabled()).toBe(false);
    expect(applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ torch: false }],
    });
  });

  it('maps NotAllowedError to denied state via handleStartError', () => {
    (controller as unknown as { handleStartError: (err: unknown) => void }).handleStartError({
      name: 'NotAllowedError',
      message: 'Permission denied',
    });

    expect(controller.cameraState()).toBe('denied');
    expect(controller.cameraErrorMessage()).toContain('denied');
  });
});
