import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { safeClearStorage, safeGetStorageItem } from '../../../core/staff/safe-storage';
import { ScannerApi } from '../../../core/staff/scanner-api';
import { ScanOutcome, StaffCheckpoint } from '../../../core/staff/scanner.models';
import { Scanner } from './scanner.component';

const GATE: StaffCheckpoint = {
  id: 'chk-main-gate',
  name: 'Main Gate Turnstile A',
  location: 'East Entrance Gates',
  type: 'MAIN_ENTRY',
  allowMultipleScans: false,
  requireMainEntry: false,
  cooldownSeconds: 0,
  eventId: 'evt-1',
  eventName: 'DLSU-D Tech Summit 2026',
};

const BOOTH: StaffCheckpoint = {
  ...GATE,
  id: 'chk-booth',
  name: 'Showcase Booth',
  type: 'BOOTH',
  allowMultipleScans: true,
  cooldownSeconds: 30,
};

const SUB_BOOTH: StaffCheckpoint = {
  ...BOOTH,
  id: 'chk-sub-booth',
  name: 'Showcase Sub-Booth 1',
  parentId: 'chk-booth',
};

function outcome(overrides: Partial<ScanOutcome> = {}): ScanOutcome {
  return {
    scanResult: 'SUCCESS',
    message: 'Check-in successful',
    scannedAt: new Date().toISOString(),
    firstScannedAt: null,
    checkpoint: { id: GATE.id, name: GATE.name, type: GATE.type },
    attendee: {
      fullName: 'Alen Mikel Umandal',
      studentId: '2023-01982-MN-0',
      ticketType: 'STUDENT',
      ticketCode: 'CHK-2026-9812A',
    },
    ...overrides,
  };
}

describe('Scanner', () => {
  let fixture: ComponentFixture<Scanner>;
  let component: Scanner;
  let api: {
    getMyCheckpoints: ReturnType<typeof vi.fn>;
    getStation: ReturnType<typeof vi.fn>;
    scan: ReturnType<typeof vi.fn>;
  };
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let queryParamMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function create(checkpoints: StaffCheckpoint[] = [GATE]) {
    api.getMyCheckpoints.mockReturnValue(of(checkpoints));
    fixture = TestBed.createComponent(Scanner);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  beforeEach(() => {
    safeClearStorage();
    paramMap$ = new BehaviorSubject(convertToParamMap({}));
    queryParamMap$ = new BehaviorSubject(convertToParamMap({}));
    api = { getMyCheckpoints: vi.fn(), getStation: vi.fn(), scan: vi.fn() };
    TestBed.configureTestingModule({
      imports: [Scanner],
      providers: [
        { provide: ScannerApi, useValue: api },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$.asObservable(),
            queryParamMap: queryParamMap$.asObservable(),
          },
        },
      ],
    });
  });

  afterEach(() => fixture?.destroy());

  it('selects the only assigned station automatically', async () => {
    await create();
    expect(component.station()?.id).toBe(GATE.id);
    expect(text()).toContain('Main Gate Turnstile A');
    expect(fixture.nativeElement.querySelector('.station-switch')).toBeNull();
  });

  it('shows a station switcher and remembers the choice when assigned to several', async () => {
    await create([GATE, BOOTH]);
    expect(fixture.nativeElement.querySelector('.station-switch')).not.toBeNull();

    component.selectStation(BOOTH.id);
    expect(safeGetStorageItem('checkpoint.scanner.station')).toBe(BOOTH.id);

    fixture.destroy();
    await create([GATE, BOOTH]);
    expect(component.station()?.id).toBe(BOOTH.id);
  });

  it('selects station from boothId route param and groups sub-booths under parent', async () => {
    paramMap$.next(convertToParamMap({ boothId: SUB_BOOTH.id }));
    await create([GATE, BOOTH, SUB_BOOTH]);

    expect(component.station()?.id).toBe(SUB_BOOTH.id);
    expect(component.parentStationName()).toBe('Showcase Booth');
    expect(component.stationOptions().map((o) => o.label)).toEqual([
      'Main Gate Turnstile A (Main entry)',
      'Showcase Booth (Booth)',
      '↳ Showcase Sub-Booth 1',
    ]);
  });

  it('shows an empty state when no station is assigned', async () => {
    await create([]);
    expect(text()).toContain('No station assigned');
  });

  it('shows a retry state when stations fail to load', async () => {
    api.getMyCheckpoints.mockReturnValue(throwError(() => new Error('offline')));
    fixture = TestBed.createComponent(Scanner);
    component = fixture.componentInstance;
    await fixture.whenStable();
    expect(text()).toContain("Couldn't load stations");
  });

  it('does not report a live camera without camera support', async () => {
    await create();
    expect(component.cameraState()).not.toBe('active');
  });

  it('submits a manual code to the selected station and shows the result', async () => {
    await create();
    api.scan.mockReturnValue(of(outcome()));

    component.manualCode.setValue(' chk-2026-9812a ');
    component.submitManual();
    await fixture.whenStable();

    expect(api.scan).toHaveBeenCalledWith(
      GATE.id,
      expect.objectContaining({ ticketCode: 'CHK-2026-9812A' }),
    );
    expect(text()).toContain('Checked in');
    expect(text()).toContain('Alen Mikel Umandal');
    expect(component.admittedCount()).toBe(1);
    expect(component.manualCode.value).toBe('');
  });

  it('submits the manual form on Enter without reloading the page', async () => {
    await create();
    api.scan.mockReturnValue(of(outcome()));

    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('#manual-code')!;
    input.value = 'CHK-2026-9812A';
    input.dispatchEvent(new Event('input'));

    const submit = new Event('submit', { cancelable: true });
    host.querySelector('form.manual-entry')!.dispatchEvent(submit);
    await fixture.whenStable();

    expect(submit.defaultPrevented).toBe(true);
    expect(api.scan).toHaveBeenCalledWith(
      GATE.id,
      expect.objectContaining({ ticketCode: 'CHK-2026-9812A' }),
    );
  });

  it('debounces identical camera decodes within cooldown window and resets on station switch', async () => {
    await create([GATE, BOOTH]);
    api.scan.mockReturnValue(of(outcome()));

    // First decode triggers API call
    (component as unknown as { onDecoded: (t: string) => void }).onDecoded('CHK-2026-9812A');
    component.dismissResult();
    expect(api.scan).toHaveBeenCalledTimes(1);

    // Immediate second decode of same code is debounced
    (component as unknown as { onDecoded: (t: string) => void }).onDecoded('CHK-2026-9812A');
    expect(api.scan).toHaveBeenCalledTimes(1);
    expect(component.debounceNotice()).toContain('scan lock');

    // Switching stations clears debounce lock
    component.selectStation(BOOTH.id);
    (component as unknown as { onDecoded: (t: string) => void }).onDecoded('CHK-2026-9812A');
    expect(api.scan).toHaveBeenCalledTimes(2);
  });

  it('shows Cooldown active title when backend enforces station cooldown', async () => {
    await create([BOOTH]);
    api.scan.mockReturnValue(
      of(
        outcome({
          scanResult: 'DUPLICATE',
          message: 'Cooldown active. Please wait 20s before rescanning at this station.',
          firstScannedAt: '2026-11-15T08:14:22.000Z',
          cooldownActive: true,
          cooldownRemainingSeconds: 20,
        }),
      ),
    );

    component.manualCode.setValue('CHK-2026-9812A');
    component.submitManual();
    await fixture.whenStable();

    expect(text()).toContain('Cooldown active');
    expect(text()).toContain('Last check-in');
  });

  it('shows the first check-in time for a duplicate scan', async () => {
    await create();
    api.scan.mockReturnValue(
      of(
        outcome({
          scanResult: 'DUPLICATE',
          message: 'Attendee has already checked in at this checkpoint.',
          firstScannedAt: '2026-11-15T08:14:22.000Z',
        }),
      ),
    );

    component.manualCode.setValue('CHK-2026-9812A');
    component.submitManual();
    await fixture.whenStable();

    expect(text()).toContain('Already checked in');
    expect(text()).toContain('First check-in');
    expect(component.flaggedCount()).toBe(1);
  });

  it('lists invalid tickets in the feed with the scanned code', async () => {
    await create();
    api.scan.mockReturnValue(
      of(outcome({ scanResult: 'INVALID_TICKET', message: 'Not valid', attendee: null })),
    );

    component.manualCode.setValue('CHK-0000-BAD');
    component.submitManual();
    await fixture.whenStable();

    const feed = fixture.nativeElement.querySelector('.recent') as HTMLElement;
    expect(feed.textContent).toContain('Unknown ticket');
    expect(feed.textContent).toContain('CHK-0000-BAD');
  });

  it('shows an error when the scan request fails', async () => {
    await create();
    api.scan.mockReturnValue(throwError(() => new Error('offline')));

    component.manualCode.setValue('CHK-2026-9812A');
    component.submitManual();
    await fixture.whenStable();

    expect(text()).toContain('Scan could not be recorded');
    expect(component.processing()).toBe(false);
  });
});
