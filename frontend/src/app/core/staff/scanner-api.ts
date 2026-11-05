import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { MockScannerApi } from './mock-scanner-api';
import { ScanOutcome, ScanRequest, StaffCheckpoint } from './scanner.models';

/**
 * Backend boundary for the staff scanner.
 *
 * The checkpoint endpoints are owned by the "Booth/Checkpoint QR Scanning"
 * task and are not built yet, so this resolves to an in-memory mock. Once the
 * API lands, add an HttpClient implementation and point `useClass` at it; the
 * scanner page only depends on this class.
 */
@Injectable({ providedIn: 'root', useClass: MockScannerApi })
export abstract class ScannerApi {
  /** Active checkpoints assigned to the current staff user. */
  abstract getMyCheckpoints(): Observable<StaffCheckpoint[]>;

  /** Records a scan. Resolves for every scan result, including DUPLICATE and INVALID_TICKET. */
  abstract scan(checkpointId: string, request: ScanRequest): Observable<ScanOutcome>;
}
