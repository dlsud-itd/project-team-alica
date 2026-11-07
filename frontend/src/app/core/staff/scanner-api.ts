import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpScannerApi } from './http-scanner-api';
import { ScanOutcome, ScanRequest, StaffCheckpoint } from './scanner.models';

/**
 * Backend boundary for the staff scanner.
 *
 * Resolves to HttpScannerApi to call the backend /api/v1/checkpoints API,
 * with fallback to MockScannerApi if offline or during testing.
 */
@Injectable({ providedIn: 'root', useClass: HttpScannerApi })
export abstract class ScannerApi {
  /** Active checkpoints assigned to the current staff user. */
  abstract getMyCheckpoints(): Observable<StaffCheckpoint[]>;

  /** Records a scan. Resolves for every scan result, including DUPLICATE and INVALID_TICKET. */
  abstract scan(checkpointId: string, request: ScanRequest): Observable<ScanOutcome>;
}
