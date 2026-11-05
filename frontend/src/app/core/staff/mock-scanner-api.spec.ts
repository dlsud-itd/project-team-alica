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

  it('is the default ScannerApi implementation', () => {
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
    const outcome = scan('chk-main-gate', 'chk-2026-9812a');
    expect(outcome.scanResult).toBe('SUCCESS');
    expect(outcome.attendee?.fullName).toBe('Alen Mikel Umandal');
  });

  it('flags a second scan at a single-scan checkpoint as duplicate', () => {
    const first = scan('chk-main-gate', 'CHK-2026-9812A');
    const second = scan('chk-main-gate', 'CHK-2026-9812A');
    expect(second.scanResult).toBe('DUPLICATE');
    expect(second.firstScannedAt).toBe(first.scannedAt);
  });

  it('allows repeat scans at a booth', () => {
    expect(scan('chk-booth-showcase', 'CHK-2026-9812A').scanResult).toBe('SUCCESS');
    expect(scan('chk-booth-showcase', 'CHK-2026-9812A').scanResult).toBe('SUCCESS');
  });

  it('warns at a session that requires main entry until the gate is passed', () => {
    expect(scan('chk-session-keynote', 'CHK-2026-4417A').scanResult).toBe('WARNING_NO_MAIN_ENTRY');
    scan('chk-main-gate', 'CHK-2026-4417A');
    expect(scan('chk-session-keynote', 'CHK-2026-4417A').scanResult).toBe('SUCCESS');
  });

  it('rejects unknown, cancelled, and other-event tickets', () => {
    const unknown = scan('chk-main-gate', 'https://example.com/fake');
    expect(unknown.scanResult).toBe('INVALID_TICKET');
    expect(unknown.attendee).toBeNull();

    expect(scan('chk-main-gate', 'CHK-2026-1203A').scanResult).toBe('INVALID_TICKET');
    expect(scan('chk-main-gate', 'CHK-2026-5521A').scanResult).toBe('INVALID_TICKET');
  });
});
