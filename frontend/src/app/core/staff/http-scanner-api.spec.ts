import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpScannerApi } from './http-scanner-api';
import { AuthService } from '../auth/auth.service';
import { ScanOutcome, StaffCheckpoint } from './scanner.models';

describe('HttpScannerApi', () => {
  let service: HttpScannerApi;
  let httpTesting: HttpTestingController;
  let mockAuth: any;

  beforeEach(() => {
    mockAuth = {
      token: () => 'fake-jwt-token',
    };

    TestBed.configureTestingModule({
      providers: [
        HttpScannerApi,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: mockAuth },
      ],
    });

    service = TestBed.inject(HttpScannerApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should fetch my checkpoints from backend', () => {
    const mockCheckpoints: StaffCheckpoint[] = [
      {
        id: 'chk-booth-1',
        name: 'Capstone Project Showcase Area',
        location: 'Ground Floor Atrium',
        type: 'BOOTH',
        allowMultipleScans: true,
        requireMainEntry: false,
        eventId: 'evt-tech-summit-2026',
        eventName: 'DLSU-D Tech Summit 2026',
      },
    ];

    service.getMyCheckpoints().subscribe((res) => {
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('chk-booth-1');
      expect(res[0].type).toBe('BOOTH');
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/my'));
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt-token');

    req.flush({ success: true, data: mockCheckpoints });
  });

  it('should post scan and return success outcome', () => {
    const mockOutcome: ScanOutcome = {
      scanResult: 'SUCCESS',
      message: 'Check-in successful',
      scannedAt: '2026-11-15T08:14:22.000Z',
      firstScannedAt: null,
      checkpoint: { id: 'chk-booth-1', name: 'Booth', type: 'BOOTH' },
      attendee: {
        fullName: 'Alen Mikel Umandal',
        studentId: '2023-01982-MN-0',
        ticketType: 'STUDENT',
        ticketCode: 'CHK-2026-9812A',
      },
    };

    service.scan('chk-booth-1', { ticketCode: 'CHK-2026-9812A' }).subscribe((res) => {
      expect(res.scanResult).toBe('SUCCESS');
      expect(res.checkpoint.type).toBe('BOOTH');
      expect(res.attendee?.fullName).toBe('Alen Mikel Umandal');
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-booth-1/scan'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer fake-jwt-token');

    req.flush({ success: true, data: mockOutcome });
  });

  it('should handle 409 Conflict as DUPLICATE outcome without crashing', () => {
    const errorData: ScanOutcome = {
      scanResult: 'DUPLICATE',
      message: 'Attendee has already checked in at this checkpoint.',
      scannedAt: '2026-11-15T08:20:00.000Z',
      firstScannedAt: '2026-11-15T08:14:22.000Z',
      checkpoint: { id: 'chk-gate-1', name: 'Main Gate', type: 'MAIN_ENTRY' },
      attendee: {
        fullName: 'Alen Mikel Umandal',
        studentId: '2023-01982-MN-0',
        ticketType: 'STUDENT',
        ticketCode: 'CHK-2026-9812A',
      },
    };

    service.scan('chk-gate-1', { ticketCode: 'CHK-2026-9812A' }).subscribe((res) => {
      expect(res.scanResult).toBe('DUPLICATE');
      expect(res.firstScannedAt).toBe('2026-11-15T08:14:22.000Z');
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-gate-1/scan'));
    req.flush({ success: false, data: errorData }, { status: 409, statusText: 'Conflict' });
  });

  it('should handle 404 NotFound as INVALID_TICKET outcome', () => {
    service.scan('chk-booth-1', { ticketCode: 'INVALID-99' }).subscribe((res) => {
      expect(res.scanResult).toBe('INVALID_TICKET');
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-booth-1/scan'));
    req.flush(
      { success: false, error: 'INVALID_TICKET' },
      { status: 404, statusText: 'Not Found' },
    );
  });

  it('should fetch station details by boothId', () => {
    service.getStation('chk-booth-1').subscribe((station) => {
      expect(station.id).toBe('chk-booth-1');
      expect(station.cooldownSeconds).toBe(30);
      expect(station.totalScans).toBe(7);
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-booth-1'));
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        id: 'chk-booth-1',
        name: 'Showcase Booth',
        location: 'Hall A',
        type: 'BOOTH',
        allowMultipleScans: true,
        requireMainEntry: false,
        cooldownSeconds: 30,
        eventId: 'evt-1',
        eventName: 'Tech Summit',
        subBooths: [],
        totalScans: 7,
      },
    });
  });

  it('should preserve cooldown metadata on 409 COOLDOWN_ACTIVE', () => {
    service.scan('chk-booth-1', { ticketCode: 'CHK-2026-9812A' }).subscribe((res) => {
      expect(res.scanResult).toBe('DUPLICATE');
      expect(res.cooldownActive).toBe(true);
      expect(res.cooldownRemainingSeconds).toBe(24);
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-booth-1/scan'));
    req.flush(
      {
        success: false,
        data: {
          scanResult: 'DUPLICATE',
          message: 'Cooldown active. Please wait 24s before rescanning at this station.',
          scannedAt: '2026-11-15T08:20:00.000Z',
          firstScannedAt: '2026-11-15T08:19:54.000Z',
          checkpoint: { id: 'chk-booth-1', name: 'Booth', type: 'BOOTH' },
          attendee: null,
          cooldownActive: true,
          cooldownRemainingSeconds: 24,
        },
      },
      { status: 409, statusText: 'Conflict' },
    );
  });

  it('should propagate 500 server error instead of silently returning mock data', () => {
    let errored = false;
    service.scan('chk-booth-1', { ticketCode: 'CHK-2026-9812A' }).subscribe({
      error: () => {
        errored = true;
      },
    });

    const req = httpTesting.expectOne((r) => r.url.endsWith('/checkpoints/chk-booth-1/scan'));
    req.flush({ message: 'Server down' }, { status: 500, statusText: 'Internal Server Error' });
    expect(errored).toBe(true);
  });
});
