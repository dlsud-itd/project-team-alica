import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventScannerComponent } from './event-scanner.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventCheckpoint, RecordScanResponse } from '../../../core/organizer/organizer.models';
import { safeClearStorage } from '../../../core/staff/safe-storage';

const MOCK_CHECKPOINTS: EventCheckpoint[] = [
  {
    id: 'chk-gate-1',
    name: 'Gate 1 (Main Entrance)',
    location: 'North Entrance',
    type: 'MAIN_ENTRY',
    allowMultipleScans: false,
    requireMainEntry: false,
    cooldownSeconds: 0,
    eventId: 'evt-devcon-manila-2026',
    eventName: 'DevCon Manila 2026',
  },
  {
    id: 'chk-booth-1',
    name: 'AWS Booth',
    location: 'Hall A',
    type: 'BOOTH',
    allowMultipleScans: true,
    requireMainEntry: false,
    cooldownSeconds: 30,
    eventId: 'evt-devcon-manila-2026',
    eventName: 'DevCon Manila 2026',
  },
];

const MOCK_SCAN_RESPONSE: RecordScanResponse = {
  scanResult: 'SUCCESS',
  ticketCode: '#DEV-928472',
  attendeeName: 'Alex Martin',
  affiliation: 'Studio Craft',
  stationName: 'Gate 1 (Main Entrance)',
  scannedAt: '2026-09-24T08:26:23.000Z',
  message: 'Check-in successful',
};

describe('EventScannerComponent', () => {
  let component: EventScannerComponent;
  let fixture: ComponentFixture<EventScannerComponent>;
  let organizerEventsMock: {
    loadEventCheckpoints: ReturnType<typeof vi.fn>;
    recordScan: ReturnType<typeof vi.fn>;
  };
  let parentParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let params$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let queryParams$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  beforeEach(async () => {
    safeClearStorage();
    parentParams$ = new BehaviorSubject(convertToParamMap({ eventId: 'evt-devcon-manila-2026' }));
    params$ = new BehaviorSubject(convertToParamMap({}));
    queryParams$ = new BehaviorSubject(convertToParamMap({}));

    organizerEventsMock = {
      loadEventCheckpoints: vi.fn().mockReturnValue(of(MOCK_CHECKPOINTS)),
      recordScan: vi.fn().mockReturnValue(of(MOCK_SCAN_RESPONSE)),
    };

    await TestBed.configureTestingModule({
      imports: [EventScannerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            parent: { paramMap: parentParams$.asObservable() },
            paramMap: params$.asObservable(),
            queryParamMap: queryParams$.asObservable(),
          },
        },
        { provide: OrganizerEventsService, useValue: organizerEventsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventScannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => fixture?.destroy());

  it('should create event scanner component', () => {
    expect(component).toBeTruthy();
  });

  it('should load stations and select first checkpoint', () => {
    expect(component.checkpoints().length).toBe(2);
    expect(component.selectedStationId()).toBe('chk-gate-1');
  });

  it('should honor boothId route param for station selection', () => {
    params$.next(convertToParamMap({ boothId: 'chk-booth-1' }));
    fixture.detectChanges();
    expect(component.selectedStationId()).toBe('chk-booth-1');
  });

  it('should record scan and update recent station scans', () => {
    component.manualCode.setValue('#DEV-928472');
    component.onManualSubmit();
    expect(component.lastResult()?.scanResult).toBe('SUCCESS');
    expect(component.recentStationScans().length).toBe(1);
  });

  it('should debounce duplicate camera decodes within lock window', () => {
    (component as unknown as { onDecoded: (t: string) => void }).onDecoded('#DEV-928472');
    component.dismissResult();
    expect(organizerEventsMock.recordScan).toHaveBeenCalledTimes(1);

    (component as unknown as { onDecoded: (t: string) => void }).onDecoded('#DEV-928472');
    expect(organizerEventsMock.recordScan).toHaveBeenCalledTimes(1);
    expect(component.debounceNotice()).toContain('scan lock');
  });

  it('should show error banner when recordScan fails', () => {
    organizerEventsMock.recordScan.mockReturnValueOnce(throwError(() => new Error('network')));
    component.manualCode.setValue('#DEV-928472');
    component.onManualSubmit();
    fixture.detectChanges();

    expect(component.scanError()).toContain('Unable to record scan');
    expect(component.processing()).toBe(false);
  });
});
