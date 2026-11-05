import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventScannerComponent } from './event-scanner.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventCheckpoint, RecordScanResponse } from '../../../core/organizer/organizer.models';

const MOCK_CHECKPOINTS: EventCheckpoint[] = [
  {
    id: 'chk-gate-1',
    name: 'Gate 1 (Main Entrance)',
    location: 'North Entrance',
    type: 'MAIN_ENTRY',
    allowMultipleScans: false,
    requireMainEntry: false,
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
  let organizerEventsMock: any;

  beforeEach(async () => {
    organizerEventsMock = {
      loadEventCheckpoints: () => of(MOCK_CHECKPOINTS),
      recordScan: () => of(MOCK_SCAN_RESPONSE),
    };

    await TestBed.configureTestingModule({
      imports: [EventScannerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OrganizerEventsService, useValue: organizerEventsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventScannerComponent);
    component = fixture.componentInstance;
    component.eventId.set('evt-devcon-manila-2026');
    component.loadStations();
    fixture.detectChanges();
  });

  it('should create event scanner component', () => {
    expect(component).toBeTruthy();
  });

  it('should load stations and select first checkpoint', () => {
    expect(component.checkpoints().length).toBe(1);
    expect(component.selectedStationId()).toBe('chk-gate-1');
  });

  it('should record scan and update recent station scans', () => {
    component.manualCode.setValue('#DEV-928472');
    component.onManualSubmit();
    expect(component.lastResult()?.scanResult).toBe('SUCCESS');
    expect(component.recentStationScans().length).toBe(1);
  });
});

