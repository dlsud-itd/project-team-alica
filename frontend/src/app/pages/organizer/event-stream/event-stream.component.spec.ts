import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { EventStreamComponent } from './event-stream.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { RecentScanItem } from '../../../core/organizer/organizer.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';
import { AuthService } from '../../../core/auth/auth.service';

const scan = (i: number): RecentScanItem => ({
  id: `log-${i}`,
  attendeeName: `Attendee ${i}`,
  affiliation: 'Org',
  ticketCode: `CHK-${i}`,
  stationId: 'booth-1',
  stationName: 'AWS Booth',
  scannedAt: '2026-09-24T08:00:00.000Z',
  status: 'SUCCESS',
  statusLabel: 'Checked In',
});

describe('EventStreamComponent', () => {
  let fixture: ComponentFixture<EventStreamComponent>;
  let component: EventStreamComponent;
  let events: any;

  beforeEach(async () => {
    events = {
      listScans: vi.fn().mockReturnValue(of([scan(1), scan(2)])),
      exportScansCsv: vi.fn().mockReturnValue(of('csv')),
      loadLiveOverview: () =>
        of({ organizerId: 'usr-org', kpis: undefined, hourlyFlow: [], stationTraffic: [], recentScans: [] }),
    };

    await TestBed.configureTestingModule({
      imports: [EventStreamComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { parent: { paramMap: of(new Map([['eventId', 'evt-1']])) } } },
        { provide: OrganizerEventsService, useValue: events },
        { provide: AuthService, useValue: { user: signal({ id: 'usr-org', role: 'USER' }) } },
        {
          provide: SubBoothApi,
          useValue: {
            listByEvent: () =>
              of([
                { id: 'booth-1', name: 'AWS Booth', type: 'BOOTH', parentId: null },
                { id: 'sub-1', name: 'AWS Demo', type: 'BOOTH', parentId: 'booth-1' },
              ]),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventStreamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the live stats above the log', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('app-event-stats')).toBeTruthy();
  });

  it('loads the scan log and renders every row', () => {
    expect(events.listScans).toHaveBeenCalledWith('evt-1', { stationId: undefined, status: undefined, limit: 100 });
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.stream-row').length).toBe(2);
  });

  it('lists sub-booths under their booth in the station filter', () => {
    expect(component.stationOptions().map((o) => o.label)).toEqual(['AWS Booth', '↳ AWS Demo']);
  });

  it('reloads with station and status filters', () => {
    component.setStation('sub-1');
    expect(events.listScans).toHaveBeenLastCalledWith('evt-1', { stationId: 'sub-1', status: undefined, limit: 100 });
    component.setStatus('DUPLICATE');
    expect(events.listScans).toHaveBeenLastCalledWith('evt-1', { stationId: 'sub-1', status: 'DUPLICATE', limit: 100 });
  });

  it('offers older scans only when the page is full', () => {
    expect(component.canLoadMore()).toBe(false);
    events.listScans.mockReturnValue(of(Array.from({ length: 100 }, (_, i) => scan(i))));
    component.loadScans();
    expect(component.canLoadMore()).toBe(true);
    component.loadMore();
    expect(events.listScans).toHaveBeenLastCalledWith('evt-1', { stationId: undefined, status: undefined, limit: 300 });
  });
});
