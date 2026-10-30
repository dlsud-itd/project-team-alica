import { TestBed } from '@angular/core/testing';
import { OrganizerEventsService } from './organizer-events.service';

describe('OrganizerEventsService', () => {
  let service: OrganizerEventsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrganizerEventsService);
  });

  it('should be created and have initial mock events', () => {
    expect(service).toBeTruthy();
    expect(service.events().length).toBeGreaterThan(0);
    expect(service.totalRegistrations()).toBeGreaterThan(0);
  });

  it('should find an event by id', () => {
    const firstEvent = service.events()[0];
    const found = service.eventById(firstEvent.id);
    expect(found).toEqual(firstEvent);
  });

  it('should update event fields with updateEvent', () => {
    const firstEvent = service.events()[0];
    service.updateEvent(firstEvent.id, {
      name: 'Hackathon 2026 Updated',
      capacity: 50,
      venue: 'Main Auditorium',
    });

    const updated = service.eventById(firstEvent.id);
    expect(updated?.name).toBe('Hackathon 2026 Updated');
    expect(updated?.capacity).toBe(50);
    expect(updated?.venue).toBe('Main Auditorium');
    // non-updated fields should be preserved
    expect(updated?.city).toBe(firstEvent.city);
  });

  it('should toggle registrant check-in status', () => {
    const registrants = service.registrants();
    const target = registrants.find((r) => r.status === 'Registered');
    if (!target) return;

    service.toggleCheckIn(target.id);
    const updated = service.registrants().find((r) => r.id === target.id);
    expect(updated?.status).toBe('Checked In');

    service.toggleCheckIn(target.id);
    const toggledBack = service.registrants().find((r) => r.id === target.id);
    expect(toggledBack?.status).toBe('Registered');
  });
});

