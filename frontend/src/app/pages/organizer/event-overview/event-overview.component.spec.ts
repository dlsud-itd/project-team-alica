import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventOverviewComponent } from './event-overview.component';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventLiveOverview } from '../../../core/organizer/organizer.models';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';

const MOCK_OVERVIEW: EventLiveOverview = {
  id: 'evt-devcon-manila-2026',
  organizerId: 'usr-org',
  name: 'DevCon Manila 2026',
  slug: 'devcon-manila-2026',
  category: 'CONFERENCE',
  categoryLabel: 'Conference',
  capacity: 1240,
  venue: 'SMX Convention Center, Mall of Asia',
  startsAt: '2026-09-24T08:00:00.000Z',
  endsAt: '2026-09-24T18:00:00.000Z',
  kpis: {
    totalRsvps: 1,
    checkedInAttendees: 1,
    attendanceRate: 100,
    venueOccupancy: 0,
    maxCapacity: 1240,
    activeStationsCount: 8,
    totalVerifiedScans: 6,
  },
  hourlyFlow: [
    { hour: '8:00 AM', scans: 3 },
    { hour: '9:00 AM', scans: 1 },
    { hour: '10:00 AM', scans: 1 },
    { hour: '11:00 AM', scans: 1 },
    { hour: '12:00 PM', scans: 0 },
  ],
  stationTraffic: [
    { id: 'chk-gate-1', name: 'Gate 1 (Main Entrance)', type: 'Main Entrance', scans: 3, percentage: 100 },
    { id: 'chk-booth-1', name: 'AWS Cloud Booth', type: 'Booth', scans: 2, percentage: 67 },
    { id: 'chk-sub-1', name: 'AWS Demo Station', type: 'Booth', scans: 1, percentage: 33 },
    { id: 'chk-plenary', name: 'Opening Plenary Session', type: 'Session', scans: 1, percentage: 33 },
  ],
  recentScans: [
    {
      id: 'log-1',
      attendeeName: 'Alex Martin',
      affiliation: 'Studio Craft',
      ticketCode: '#DEV-928472',
      stationName: 'AWS Demo Station',
      scannedAt: '2026-09-24T08:26:23.000Z',
      status: 'SUCCESS',
      statusLabel: 'Checked In',
    },
  ],
};

const MOCK_CHECKPOINTS: StaffCheckpoint[] = [
  {
    id: 'chk-gate-1',
    name: 'Gate 1 (Main Entrance)',
    location: 'Level 1',
    type: 'MAIN_ENTRY',
    allowMultipleScans: false,
    requireMainEntry: false,
    eventId: 'evt-devcon-manila-2026',
    eventName: 'DevCon Manila 2026',
    parentId: null,
  },
  {
    id: 'chk-booth-1',
    name: 'AWS Cloud Booth',
    location: 'Hall A',
    type: 'BOOTH',
    allowMultipleScans: true,
    requireMainEntry: false,
    eventId: 'evt-devcon-manila-2026',
    eventName: 'DevCon Manila 2026',
    parentId: null,
  },
  {
    id: 'chk-sub-1',
    name: 'AWS Demo Station',
    location: 'Hall A',
    type: 'BOOTH',
    allowMultipleScans: true,
    requireMainEntry: false,
    eventId: 'evt-devcon-manila-2026',
    eventName: 'DevCon Manila 2026',
    parentId: 'chk-booth-1',
  },
];

describe('EventOverviewComponent', () => {
  let component: EventOverviewComponent;
  let fixture: ComponentFixture<EventOverviewComponent>;
  let organizerEventsMock: any;
  let subBoothApiMock: any;
  let userSignal: ReturnType<typeof signal<any>>;

  beforeEach(async () => {
    userSignal = signal({
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'USER',
    });

    organizerEventsMock = {
      loadLiveOverview: () => of(MOCK_OVERVIEW),
      exportScansCsv: () => of('Ticket Code,Attendee\n#DEV-928472,Alex Martin'),
      loadStaff: () => of([]),
    };

    subBoothApiMock = {
      listByEvent: vi.fn().mockReturnValue(of(MOCK_CHECKPOINTS)),
      create: vi.fn().mockReturnValue(
        of({
          ...MOCK_CHECKPOINTS[2],
          id: 'chk-sub-2',
          name: 'AWS Workshop Desk',
        }),
      ),
    };

    await TestBed.configureTestingModule({
      imports: [EventOverviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { user: userSignal } },
        { provide: OrganizerEventsService, useValue: organizerEventsMock },
        { provide: SubBoothApi, useValue: subBoothApiMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventOverviewComponent);
    component = fixture.componentInstance;
    component.eventId.set('evt-devcon-manila-2026');
    component.fetchOverview();
    component['loadCheckpoints']();
    fixture.detectChanges();
  });

  it('should create event overview component', () => {
    expect(component).toBeTruthy();
  });

  it('should render telemetry KPIs and calculate SVG points', () => {
    expect(component.kpis().totalRsvps).toBe(1);
    expect(component.kpis().activeStationsCount).toBe(8);
    expect(component.chartSvgData().points.length).toBe(5);
  });

  it('should group sub-booths under parent booth, compute sub-totals, and open detail card', () => {
    expect(subBoothApiMock.listByEvent).toHaveBeenCalledWith('evt-devcon-manila-2026');
    expect(component.canAddSubBooth('chk-booth-1')).toBe(true);
    expect(component.canAddSubBooth('chk-gate-1')).toBe(false);
    expect(component.isSubBooth('chk-sub-1')).toBe(true);
    expect(component.subTotalFor('chk-booth-1')).toEqual({ scans: 1, count: 1 });

    const orderedIds = component.orderedStations().map((s) => s.id);
    expect(orderedIds).toEqual(['chk-gate-1', 'chk-booth-1', 'chk-sub-1', 'chk-plenary']);

    component.openSubDetail('chk-sub-1');
    fixture.detectChanges();

    const detail = component.selectedSub();
    expect(detail).toBeTruthy();
    expect(detail?.parentName).toBe('AWS Cloud Booth');
    expect(detail?.parentScans).toBe(2);
    expect(detail?.share).toBe(33);
    expect(detail?.scans.length).toBe(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('SUB-BOOTH: AWS Demo Station');
  });

  it('should hide + Sub-booth for non-organizer staff users and allow creating sub-booth for organizer', () => {
    userSignal.set({
      id: 'usr-staff',
      email: 'staff@checkpoint.ph',
      fullName: 'Staff User',
      role: 'USER',
    });
    fixture.detectChanges();
    expect(component.canAddSubBooth('chk-booth-1')).toBe(false);

    userSignal.set({
      id: 'usr-org',
      email: 'organizer@alica.ph',
      fullName: 'Campus Organizer',
      role: 'USER',
    });
    fixture.detectChanges();
    expect(component.canAddSubBooth('chk-booth-1')).toBe(true);

    component.openSubBoothForm('chk-booth-1');
    component.subName.set('AWS Workshop Desk');
    component.submitSubBooth(new Event('submit'));
    expect(subBoothApiMock.create).toHaveBeenCalledWith('chk-booth-1', {
      name: 'AWS Workshop Desk',
      location: undefined,
    });
  });
});

