import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { MockScannerApi } from './mock-scanner-api';
import type { ScannerApi } from './scanner-api';
import { CheckpointType, ScanOutcome, ScanRequest, ScanResult, StaffCheckpoint } from './scanner.models';

@Injectable({ providedIn: 'root' })
export class HttpScannerApi implements ScannerApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly mockFallback = inject(MockScannerApi);
  private readonly apiUrl = environment.apiUrl;

  getMyCheckpoints(): Observable<StaffCheckpoint[]> {
    const headers = this.buildHeaders();
    return this.http
      .get<{ success: boolean; data: StaffCheckpoint[] }>(`${this.apiUrl}/checkpoints/my`, {
        headers,
      })
      .pipe(
        map((res) => res.data),
        catchError((err) => {
          // If network / server error, fallback to mock checkpoints gracefully
          console.warn('Backend checkpoints API unavailable, using local mock data:', err);
          return this.mockFallback.getMyCheckpoints();
        }),
      );
  }

  scan(checkpointId: string, request: ScanRequest): Observable<ScanOutcome> {
    const headers = this.buildHeaders();
    return this.http
      .post<{ success: boolean; statusCode?: number; message?: string; data: ScanOutcome }>(
        `${this.apiUrl}/checkpoints/${checkpointId}/scan`,
        request,
        { headers },
      )
      .pipe(
        map((res) => res.data),
        catchError((err: HttpErrorResponse): Observable<ScanOutcome> => {
          // 409 DUPLICATE, 404 INVALID_TICKET, and 400 CANCELLED return structured outcome in body
          if (err.error && err.error.data) {
            return of(err.error.data as ScanOutcome);
          }

          if (err.status === 409 || err.status === 404 || err.status === 400) {
            const resultType: ScanResult = err.status === 409 ? 'DUPLICATE' : 'INVALID_TICKET';
            const outcome: ScanOutcome = {
              scanResult: resultType,
              message:
                err.error?.message ||
                (err.status === 409
                  ? 'Attendee has already checked in at this checkpoint.'
                  : 'Ticket code does not exist or is not valid for this event.'),
              scannedAt: new Date().toISOString(),
              firstScannedAt: null,
              checkpoint: { id: checkpointId, name: 'Checkpoint', type: 'MAIN_ENTRY' as CheckpointType },
              attendee: null,
            };
            return of(outcome);
          }

          // If server is unreachable, fallback to mock evaluator
          console.warn('Backend scan API call failed, falling back to local evaluator:', err);
          return this.mockFallback.scan(checkpointId, request);
        }),
      );
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.auth.token();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }
}
