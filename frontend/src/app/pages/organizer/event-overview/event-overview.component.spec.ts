import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventOverviewComponent } from './event-overview.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventLiveOverview } from '../../../core/organizer/organizer.models';

const MOCK_OVERVIEW: EventLiveOverview = {
  id: 'evt-devcon-manila-2026',
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
    { id: 'chk-plenary', name: 'Opening Plenary Session', type: 'Session', scans: 1, percentage: 33 },
  ],
  recentScans: [
    {
      id: 'log-1',
      attendeeName: 'Alex Martin',
      affiliation: 'Studio Craft',
      ticketCode: '#DEV-928472',
      stationName: 'Gate 1 (Main Entrance)',
      scannedAt: '2026-09-24T08:26:23.000Z',
      status: 'DUPLICATE',
      statusLabel: 'Duplicate',
    },
  ],
};

describe('EventOverviewComponent', () => {
  let component: EventOverviewComponent;
  let fixture: ComponentFixture<EventOverviewComponent>;
  let organizerEventsMock: any;

  beforeEach(async () => {
    organizerEventsMock = {
      loadLiveOverview: () => of(MOCK_OVERVIEW),
      exportScansCsv: () => of('Ticket Code,Attendee\n#DEV-928472,Alex Martin'),
    };

    await TestBed.configureTestingModule({
      imports: [EventOverviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: OrganizerEventsService, useValue: organizerEventsMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventOverviewComponent);
    component = fixture.componentInstance;
    component.eventId.set('evt-devcon-manila-2026');
    component.fetchOverview();
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
});

