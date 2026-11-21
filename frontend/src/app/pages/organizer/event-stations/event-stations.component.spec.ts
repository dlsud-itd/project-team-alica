import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { EventStationsComponent } from './event-stations.component';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';

const base = {
  location: 'Hall A',
  allowMultipleScans: false,
  requireMainEntry: false,
  eventId: 'evt-1',
  eventName: 'DevCon',
  parentId: null,
};

const STATIONS: StaffCheckpoint[] = [
  { ...base, id: 'gate-1', name: 'Gate 1', type: 'MAIN_ENTRY' },
  { ...base, id: 'ses-1', name: 'Keynote', type: 'SESSION', requireMainEntry: true },
  { ...base, id: 'booth-1', name: 'AWS Booth', type: 'BOOTH', allowMultipleScans: true },
  { ...base, id: 'sub-1', name: 'AWS Demo', type: 'BOOTH', parentId: 'booth-1' },
];

describe('EventStationsComponent', () => {
  let fixture: ComponentFixture<EventStationsComponent>;
  let component: EventStationsComponent;
  let api: any;
  let userSignal: ReturnType<typeof signal<any>>;

  async function setup(stations: StaffCheckpoint[] = STATIONS) {
    userSignal = signal({ id: 'usr-org', email: 'o@alica.ph', fullName: 'Org', role: 'USER' });
    api = {
      listByEvent: vi.fn().mockReturnValue(of(stations)),
      createCheckpoint: vi.fn().mockReturnValue(of(stations[0])),
      create: vi.fn().mockReturnValue(of(stations[0])),
      update: vi.fn().mockReturnValue(of(stations[0])),
      remove: vi.fn().mockReturnValue(of({ success: true, message: 'ok' })),
    };

    await TestBed.configureTestingModule({
      imports: [EventStationsComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { parent: { paramMap: of(new Map([['eventId', 'evt-1']])) } } },
        { provide: AuthService, useValue: { user: userSignal } },
        {
          provide: OrganizerEventsService,
          useValue: {
            events: signal([{ id: 'evt-1', organizer_id: 'usr-org' }]),
            loadStaff: () => of([]),
            addStaff: vi.fn(),
            removeStaff: vi.fn(),
          },
        },
        { provide: SubBoothApi, useValue: api },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventStationsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('groups stations by type with sub-booths under their booth', async () => {
    await setup();
    const sections = component.sections();
    expect(sections.map((s) => s.type)).toEqual(['MAIN_ENTRY', 'SESSION', 'BOOTH', 'EXIT']);
    const booths = sections.find((s) => s.type === 'BOOTH')!;
    expect(booths.stations).toHaveLength(1);
    expect(booths.stations[0].children.map((c) => c.id)).toEqual(['sub-1']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('↳ AWS Demo');
  });

  it('creates a station of the section type with sensible defaults', async () => {
    await setup();
    component.openCreate('BOOTH');
    expect(component.formMultiScan()).toBe(true);

    component.submitForm(new Event('submit'));
    expect(component.formError()).toBe('Please enter a name.');

    component.formName.set(' Google Booth ');
    component.formRequireEntry.set(true);
    component.submitForm(new Event('submit'));
    expect(api.createCheckpoint).toHaveBeenCalledWith({
      eventId: 'evt-1',
      name: 'Google Booth',
      type: 'BOOTH',
      location: undefined,
      allowMultipleScans: true,
      requireMainEntry: true,
    });
    expect(component.form()).toBeNull();
  });

  it('edits a top-level station including its type and entry rule', async () => {
    await setup();
    component.openEdit(STATIONS[1]);
    expect(component.formTypeEditable()).toBe(true);
    expect(component.formShowsEntryRule()).toBe(true);
    component.formName.set('Opening Keynote');
    component.submitForm(new Event('submit'));
    expect(api.update).toHaveBeenCalledWith('ses-1', {
      name: 'Opening Keynote',
      location: 'Hall A',
      allowMultipleScans: false,
      type: 'SESSION',
      requireMainEntry: true,
    });
  });

  it('edits a sub-booth without type or entry rule, and adds sub-booths under booths', async () => {
    await setup();
    component.openEdit(STATIONS[3]);
    expect(component.formTypeEditable()).toBe(false);
    expect(component.formShowsEntryRule()).toBe(false);
    component.submitForm(new Event('submit'));
    expect(api.update).toHaveBeenCalledWith('sub-1', {
      name: 'AWS Demo',
      location: 'Hall A',
      allowMultipleScans: false,
    });

    component.openSub(STATIONS[2]);
    component.formName.set('Workshop desk');
    component.submitForm(new Event('submit'));
    expect(api.create).toHaveBeenCalledWith('booth-1', {
      name: 'Workshop desk',
      location: undefined,
      allowMultipleScans: true,
    });
  });

  it('removes stations after confirmation, but never the main entry gate', async () => {
    await setup();
    expect(component.canRemove(STATIONS[0])).toBe(false);
    component.openRemove('booth-1');
    component.confirmRemove();
    expect(api.remove).toHaveBeenCalledWith('booth-1');
    expect(component.removingId()).toBeNull();
  });

  it('warns when stations require entry but the event has no entry gate', async () => {
    await setup(STATIONS.filter((s) => s.type !== 'MAIN_ENTRY'));
    expect(component.blockedByMissingGate().map((s) => s.id)).toEqual(['ses-1']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No entry gate yet');
  });

  it('hides management buttons for non-organizers', async () => {
    await setup();
    userSignal.set({ id: 'usr-staff', email: 's@alica.ph', fullName: 'Staff', role: 'USER' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.btn-add-booth')).toBeNull();
    expect(el.querySelector('.btn-remove-booth')).toBeNull();
  });
});
