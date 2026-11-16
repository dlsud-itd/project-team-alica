import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { ScannerApi } from './scanner-api';
import { ScannerDiagnosticsService } from './scanner-diagnostics.service';
import {
  CheckpointType,
  ScanOutcome,
  ScanRequest,
  ScanResult,
  StaffCheckpoint,
  StationDetails,
} from './scanner.models';

@Injectable({ providedIn: 'root' })
export class HttpScannerApi implements ScannerApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly diagnostics = inject(ScannerDiagnosticsService);
  private readonly apiUrl = environment.apiUrl;

  getMyCheckpoints(): Observable<StaffCheckpoint[]> {
    const headers = this.buildHeaders();
    return this.http
      .get<{ success: boolean; data: StaffCheckpoint[] }>(`${this.apiUrl}/checkpoints/my`, {
        headers,
      })
      .pipe(
        map((res) => res.data),
        catchError((err: HttpErrorResponse) => {
          this.diagnostics.error('api', 'Failed to load assigned checkpoints', {
            status: err.status,
            message: err.message,
          });
          return throwError(() => err);
        }),
      );
  }

  getStation(boothId: string): Observable<StationDetails> {
    const headers = this.buildHeaders();
    return this.http
      .get<{ success: boolean; data: StationDetails }>(`${this.apiUrl}/checkpoints/${boothId}`, {
        headers,
      })
      .pipe(
        map((res) => res.data),
        catchError((err: HttpErrorResponse) => {
          this.diagnostics.error('api', 'Failed to load station details', {
            boothId,
            status: err.status,
            message: err.message,
          });
          return throwError(() => err);
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
          // 409 DUPLICATE/COOLDOWN, 404 INVALID_TICKET, and 400 CANCELLED return structured outcome in body
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
              checkpoint: {
                id: checkpointId,
                name: 'Checkpoint',
                type: 'MAIN_ENTRY' as CheckpointType,
              },
              attendee: null,
            };
            return of(outcome);
          }

          this.diagnostics.error('api', 'Scan request failed', {
            checkpointId,
            status: err.status,
            message: err.message,
          });
          return throwError(() => err);
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
