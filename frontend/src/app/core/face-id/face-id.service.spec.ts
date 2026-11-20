import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FaceIdService } from './face-id.service';
import { environment } from '../../../environments/environment';

describe('FaceIdService', () => {
  let service: FaceIdService;
  let httpMock: HttpTestingController;

  const mockDescriptor = Array.from({ length: 128 }, (_, i) => i * 0.01);

  beforeEach(() => {
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        configurable: true,
        value: {
          getUserMedia: vi.fn(),
        },
      });
    }

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), FaceIdService],
    });

    service = TestBed.inject(FaceIdService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('HTTP endpoints', () => {
    it('getFaceStatus should send GET request', () => {
      service.getFaceStatus().subscribe((res) => {
        expect(res.registered).toBe(true);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/profile/face-status`);
      expect(req.request.method).toBe('GET');
      req.flush({ registered: true });
    });

    it('registerFace should send POST request with descriptor', () => {
      service.registerFace(mockDescriptor).subscribe((res) => {
        expect(res.success).toBe(true);
        expect(res.message).toBe('Face ID registered successfully');
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/profile/face`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ descriptor: mockDescriptor });
      req.flush({
        success: true,
        message: 'Face ID registered successfully',
        registeredAt: new Date().toISOString(),
      });
    });

    it('removeFace should send DELETE request', () => {
      service.removeFace().subscribe((res) => {
        expect(res.success).toBe(true);
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/profile/face`);
      expect(req.request.method).toBe('DELETE');
      req.flush({ success: true, message: 'Face ID removed successfully' });
    });
  });

  describe('Session Storage dismissal', () => {
    it('tracks dismissal state within current session', () => {
      expect(service.isDismissedThisSession()).toBe(false);

      service.dismissThisSession();
      expect(service.isDismissedThisSession()).toBe(true);

      service.clearSessionDismissal();
      expect(service.isDismissedThisSession()).toBe(false);
    });
  });

  describe('Camera Management', () => {
    it('stops active tracks cleanly when stopCamera is called', () => {
      const stopFn = vi.fn();
      const mockTrack = { stop: stopFn } as unknown as MediaStreamTrack;
      const mockStream = {
        getTracks: () => [mockTrack],
      } as unknown as MediaStream;

      (service as any).activeStream = mockStream;

      const videoElement = document.createElement('video');
      videoElement.srcObject = mockStream;

      service.stopCamera(videoElement);

      expect(stopFn).toHaveBeenCalled();
      expect((service as any).activeStream).toBeNull();
      expect(videoElement.srcObject).toBeNull();
    });

    it('throws meaningful error on camera permission denial', async () => {
      const notAllowedError = new Error('Permission denied');
      notAllowedError.name = 'NotAllowedError';

      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(
        notAllowedError,
      );

      const video = document.createElement('video');
      await expect(service.startCamera(video)).rejects.toThrow(
        /Camera permission denied/i,
      );
    });

    it('throws meaningful error when no camera is found', async () => {
      const notFoundError = new Error('No device found');
      notFoundError.name = 'NotFoundError';

      vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(
        notFoundError,
      );

      const video = document.createElement('video');
      await expect(service.startCamera(video)).rejects.toThrow(
        /No camera found/i,
      );
    });
  });

  describe('detectFaceDescriptor', () => {
    it('returns 128-number array when face is detected', async () => {
      const fakeDescriptor = new Float32Array(mockDescriptor);
      const fakeFaceApi = {
        nets: {
          tinyFaceDetector: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
          faceLandmark68Net: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
          faceRecognitionNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
        },
        TinyFaceDetectorOptions: class {},
        detectSingleFace: vi.fn().mockReturnValue({
          withFaceLandmarks: vi.fn().mockReturnValue({
            withFaceDescriptor: vi.fn().mockResolvedValue({
              descriptor: fakeDescriptor,
            }),
          }),
        }),
      };

      vi.spyOn(service, 'getFaceApi').mockResolvedValue(fakeFaceApi as any);

      const video = document.createElement('video');
      const result = await service.detectFaceDescriptor(video);

      expect(result.length).toBe(128);
      expect(result[0]).toBeCloseTo(0);
      expect(result[127]).toBeCloseTo(1.27);
    });

    it('throws error when no face is detected in frame', async () => {
      const fakeFaceApi = {
        nets: {
          tinyFaceDetector: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
          faceLandmark68Net: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
          faceRecognitionNet: { loadFromUri: vi.fn().mockResolvedValue(undefined) },
        },
        TinyFaceDetectorOptions: class {},
        detectSingleFace: vi.fn().mockReturnValue({
          withFaceLandmarks: vi.fn().mockReturnValue({
            withFaceDescriptor: vi.fn().mockResolvedValue(null),
          }),
        }),
      };

      vi.spyOn(service, 'getFaceApi').mockResolvedValue(fakeFaceApi as any);

      const video = document.createElement('video');
      await expect(service.detectFaceDescriptor(video)).rejects.toThrow(
        /No face detected/i,
      );
    });
  });
});
