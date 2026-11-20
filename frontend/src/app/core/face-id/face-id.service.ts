import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  FaceStatusResponse,
  RegisterFaceResponse,
  RemoveFaceResponse,
  RegisterFacePayload,
} from './face-id.model';

@Injectable({
  providedIn: 'root',
})
export class FaceIdService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  private activeStream: MediaStream | null = null;
  private modelsLoaded = false;
  private modelsLoadingPromise: Promise<void> | null = null;
  private faceApiModule: typeof import('@vladmandic/face-api') | null = null;

  private readonly SESSION_DISMISS_KEY = 'checkpoint_face_id_dismissed';

  /**
   * Lazily loads the face-api.js ESM module.
   */
  async getFaceApi(): Promise<typeof import('@vladmandic/face-api')> {
    if (!this.faceApiModule) {
      this.faceApiModule = await import('@vladmandic/face-api');
    }
    return this.faceApiModule;
  }

  /**
   * Lazily loads the face-api neural network weights from assets/models.
   * Model files required in assets/models:
   * - tiny_face_detector_model-weights_manifest.json and shard files
   * - face_landmark_68_model-weights_manifest.json and shard files
   * - face_recognition_model-weights_manifest.json and shard files
   */
  async loadModels(modelPath = '/assets/models'): Promise<void> {
    if (this.modelsLoaded) {
      return;
    }

    if (this.modelsLoadingPromise) {
      return this.modelsLoadingPromise;
    }

    this.modelsLoadingPromise = (async () => {
      try {
        const faceapi = await this.getFaceApi();
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
        ]);
        this.modelsLoaded = true;
      } catch (err: unknown) {
        this.modelsLoadingPromise = null;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        throw new Error(`Failed to load facial recognition models: ${msg}`);
      }
    })();

    return this.modelsLoadingPromise;
  }

  /**
   * Requests camera permission and attaches the user-facing video stream to the video element.
   * Stops any pre-existing tracks to prevent camera hardware locks.
   */
  async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    this.stopCamera(videoElement);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      throw new Error('Camera access is not supported by your browser or environment.');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      this.activeStream = stream;
      videoElement.srcObject = stream;
      await videoElement.play();
      return stream;
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (
        error?.name === 'NotAllowedError' ||
        error?.name === 'PermissionDeniedError'
      ) {
        throw new Error(
          'Camera permission denied. Please allow camera access in your browser settings to register Face ID.',
        );
      }
      if (
        error?.name === 'NotFoundError' ||
        error?.name === 'DevicesNotFoundError'
      ) {
        throw new Error('No camera found on this device.');
      }
      throw new Error(
        `Unable to access camera: ${error?.message || 'Unknown device error'}`,
      );
    }
  }

  /**
   * Immediately releases all active camera tracks and detaches srcObject from the video element.
   * Guarantees zero hardware contention with QR scanning (ZXing).
   */
  stopCamera(videoElement?: HTMLVideoElement | null): void {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore already stopped tracks
        }
      });
      this.activeStream = null;
    }

    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  /**
   * Detects a single face in the live video element and extracts a 128-number descriptor.
   * Never stores or uploads raw photos.
   */
  async detectFaceDescriptor(videoElement: HTMLVideoElement): Promise<number[]> {
    await this.loadModels();
    const faceapi = await this.getFaceApi();

    const options = new faceapi.TinyFaceDetectorOptions({
      inputSize: 224,
      scoreThreshold: 0.5,
    });

    const detection = await faceapi
      .detectSingleFace(videoElement, options)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection || !detection.descriptor) {
      throw new Error(
        'No face detected. Please align your face inside the guide and ensure good lighting.',
      );
    }

    return Array.from(detection.descriptor);
  }

  /**
   * Checks whether Face ID is registered for the currently logged-in user.
   */
  getFaceStatus(): Observable<FaceStatusResponse> {
    return this.http.get<FaceStatusResponse>(
      `${this.apiUrl}/profile/face-status`,
    );
  }

  /**
   * Persists the 128-float face descriptor on the logged-in user record.
   */
  registerFace(descriptor: number[]): Observable<RegisterFaceResponse> {
    const payload: RegisterFacePayload = { descriptor };
    return this.http.post<RegisterFaceResponse>(
      `${this.apiUrl}/profile/face`,
      payload,
    );
  }

  /**
   * Clears the stored face descriptor and registration timestamp.
   */
  removeFace(): Observable<RemoveFaceResponse> {
    return this.http.delete<RemoveFaceResponse>(`${this.apiUrl}/profile/face`);
  }

  /**
   * Session storage helper to check if the user previously chose "Not now" in this browser session.
   */
  isDismissedThisSession(): boolean {
    try {
      return sessionStorage.getItem(this.SESSION_DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Suppresses the Face ID prompt for the remainder of this session.
   */
  dismissThisSession(): void {
    try {
      sessionStorage.setItem(this.SESSION_DISMISS_KEY, 'true');
    } catch {
      // Storage unavailable fallback
    }
  }

  /**
   * Clears session dismissal flag (e.g. on manual registration request or logout).
   */
  clearSessionDismissal(): void {
    try {
      sessionStorage.removeItem(this.SESSION_DISMISS_KEY);
    } catch {
      // Storage unavailable fallback
    }
  }
}
