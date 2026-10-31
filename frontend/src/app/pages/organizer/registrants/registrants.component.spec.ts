import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { OrganizerRegistrants } from './registrants.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventRegistrant } from '../../../core/organizer/organizer.models';

const MOCK_REGISTRANT: EventRegistrant = {
  id: 'tkt-1',
  event_id: 'evt-1',
  attendee_id: 'usr-1',
  full_name: 'Alyssa Santos',
  email: 'alyssa@example.com',
  ticket_id: 'CHK-2026-1234A',
  registered_at: '2026-10-12T02:15:00.000Z',
  status: 'Registered',
};

const CANCELLED_REGISTRANT: EventRegistrant = {
  ...MOCK_REGISTRANT,
  id: 'tkt-2',
  ticket_id: 'CHK-2026-9999C',
  full_name: 'Carlos Ruiz',
  email: 'carlos@example.com',
  status: 'Cancelled',
};

describe('OrganizerRegistrants', () => {
  let component: OrganizerRegistrants;
  let fixture: ComponentFixture<OrganizerRegistrants>;
  let organizerEvents: OrganizerEventsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerRegistrants],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(new Map([['eventId', 'evt-1']])),
          },
        },
      ],
    }).compileComponents();

    organizerEvents = TestBed.inject(OrganizerEventsService);
    // Seed registrants into service signal
    (organizerEvents as unknown as { registrantState: { set: (v: unknown[]) => void } }).registrantState.set([
      MOCK_REGISTRANT,
      CANCELLED_REGISTRANT,
    ]);

    fixture = TestBed.createComponent(OrganizerRegistrants);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render correct status CSS class', () => {
    expect(component.statusClass('Checked In')).toBe('status-checked-in');
    expect(component.statusClass('Cancelled')).toBe('status-cancelled');
    expect(component.statusClass('Registered')).toBe('status-registered');
  });

  it('should correctly filter attendees by status', () => {
    expect(component.attendees().length).toBe(2);

    component.setStatusFilter('Registered');
    expect(component.attendees().length).toBe(1);
    expect(component.attendees()[0].id).toBe('tkt-1');

    component.setStatusFilter('Cancelled');
    expect(component.attendees().length).toBe(1);
    expect(component.attendees()[0].id).toBe('tkt-2');

    component.setStatusFilter('ALL');
    expect(component.attendees().length).toBe(2);
  });

  it('should open and close QR pass dialog', () => {
    component.openQrPass(MOCK_REGISTRANT);
    expect(component.activeQrRegistrant()?.id).toBe('tkt-1');

    component.closeQrPass();
    expect(component.activeQrRegistrant()).toBeNull();
    expect(component.qrDataUrl()).toBe('');
  });

  it('should open and dismiss cancel confirmation modal', () => {
    component.confirmCancel(MOCK_REGISTRANT);
    expect(component.cancellingRegistrant()?.id).toBe('tkt-1');

    component.dismissCancelDialog();
    expect(component.cancellingRegistrant()).toBeNull();
  });

  it('should open and dismiss restore confirmation modal', () => {
    component.confirmRestore(CANCELLED_REGISTRANT);
    expect(component.restoringRegistrant()?.id).toBe('tkt-2');

    component.dismissRestoreDialog();
    expect(component.restoringRegistrant()).toBeNull();
  });
});
