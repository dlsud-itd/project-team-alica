import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpScannerApi } from './http-scanner-api';
import { ScanOutcome, ScanRequest, StaffCheckpoint, StationDetails } from './scanner.models';

/**
 * Backend boundary for the staff scanner.
 *
 * Resolves to HttpScannerApi to call the backend /api/v1/checkpoints API.
 */
@Injectable({ providedIn: 'root', useClass: HttpScannerApi })
export abstract class ScannerApi {
  /** Active checkpoints assigned to the current staff user. */
  abstract getMyCheckpoints(): Observable<StaffCheckpoint[]>;

  /** Detailed station metadata (sub-booths, cooldown rules, scan count) for a boothId. */
  abstract getStation(boothId: string): Observable<StationDetails>;

  /** Records a scan. Resolves for every scan result, including DUPLICATE and INVALID_TICKET. */
  abstract scan(checkpointId: string, request: ScanRequest): Observable<ScanOutcome>;
}
