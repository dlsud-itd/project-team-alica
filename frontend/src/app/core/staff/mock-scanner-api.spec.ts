import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import { vi } from 'vitest';
import { MockScannerApi } from './mock-scanner-api';
import { ScannerApi } from './scanner-api';
import { ScanOutcome } from './scanner.models';

describe('MockScannerApi', () => {
  let api: MockScannerApi;

  beforeEach(() => {
    vi.useFakeTimers();
    api = new MockScannerApi();
  });

  afterEach(() => vi.useRealTimers());

  function resolve<T>(source: Observable<T>): T {
    let value: T | undefined;
    source.subscribe((v) => (value = v));
    vi.runAllTimers();
    return value as T;
  }

  const scan = (checkpointId: string, ticketCode: string): ScanOutcome =>
    resolve(api.scan(checkpointId, { ticketCode }));

  it('can be injected as a ScannerApi implementation', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: ScannerApi, useClass: MockScannerApi }],
    });
    expect(TestBed.inject(ScannerApi)).toBeInstanceOf(MockScannerApi);
  });

  it('returns the seeded checkpoints', () => {
    const checkpoints = resolve(api.getMyCheckpoints());
    expect(checkpoints.map((c) => c.id)).toEqual([
      'chk-main-gate',
      'chk-session-keynote',
      'chk-booth-showcase',
    ]);
  });

  it('admits a valid ticket at the main gate', () => {
    const outcome = scan('chk-main-gate', 'CHK-2026-9812A');
    expect(outcome.scanResult).toBe('SUCCESS');
    expect(outcome.attendee?.fullName).toBe('Alen Mikel Umandal');
  });

  it('flags a second scan at a single-scan checkpoint as duplicate', () => {
    scan('chk-main-gate', 'CHK-2026-9812A');
    const duplicate = scan('chk-main-gate', 'CHK-2026-9812A');
    expect(duplicate.scanResult).toBe('DUPLICATE');
    expect(duplicate.firstScannedAt).toBeTruthy();
  });

  it('allows repeat scans at a booth', () => {
    const first = scan('chk-booth-showcase', 'CHK-2026-9812A');
    const second = scan('chk-booth-showcase', 'CHK-2026-9812A');
    expect(first.scanResult).toBe('SUCCESS');
    expect(second.scanResult).toBe('SUCCESS');
  });

  it('warns at a session that requires main entry until the gate is passed', () => {
    const warned = scan('chk-session-keynote', 'CHK-2026-4417A');
    expect(warned.scanResult).toBe('WARNING_NO_MAIN_ENTRY');

    scan('chk-main-gate', 'CHK-2026-4417A');
    const admitted = scan('chk-session-keynote', 'CHK-2026-4417A');
    expect(admitted.scanResult).toBe('SUCCESS');
  });

  it('rejects unknown, cancelled, and other-event tickets', () => {
    expect(scan('chk-main-gate', 'NOPE').scanResult).toBe('INVALID_TICKET');
    expect(scan('chk-main-gate', 'CHK-2026-1203A').scanResult).toBe('INVALID_TICKET');
    expect(scan('chk-main-gate', 'CHK-2026-5521A').scanResult).toBe('INVALID_TICKET');
  });
});
