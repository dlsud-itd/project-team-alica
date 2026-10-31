import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';
import { OrganizerDashboard } from './dashboard.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

describe('OrganizerDashboard', () => {
  let component: OrganizerDashboard;
  let fixture: ComponentFixture<OrganizerDashboard>;
  let eventsService: OrganizerEventsService;
  let event: OrganizerEvent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    TestBed.inject(AuthService).setSession(
      {
        id: 'organizer-1',
        email: 'organizer@example.com',
        fullName: 'Test Organizer',
        role: 'ORGANIZER',
      },
      'test-token',
    );
    const httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrganizerDashboard);
    component = fixture.componentInstance;
    eventsService = TestBed.inject(OrganizerEventsService);
    event = {
      id: 'event-1',
      organizer_id: 'organizer-1',
      name: 'Test event',
      starts_at: '2026-11-18T09:00:00.000Z',
      ends_at: '2026-11-18T17:00:00.000Z',
      venue: 'Main Hall',
      registrations_count: 4,
      capacity: 10,
      status: 'Upcoming',
    };
    httpTesting
      .expectOne(`${environment.apiUrl}/events/organizer`)
      .flush({ success: true, data: { events: [event], registrants: [] } });
    await fixture.whenStable();
  });

  it('should create and display events returned by the API', () => {
    expect(component).toBeTruthy();
    expect(component.events()).toEqual([event]);
  });

  it('should open edit modal with pre-populated values when openEdit is called', () => {
    component.openEdit(event);

    expect(component.editingEvent()).toEqual(event);
    expect(component.editForm.value.name).toBe(event.name);
    expect(component.editForm.value.venue).toBe(event.venue);
    expect(component.editForm.value.capacity).toBe(event.capacity);
    expect(component.editErrorMessage()).toBe('');
  });

  it('should close edit modal and reset form when closeEdit is called', () => {
    component.openEdit(event);
    component.closeEdit();

    expect(component.editingEvent()).toBeNull();
    expect(component.editErrorMessage()).toBe('');
  });

  it('should update event and show notice when valid changes are saved', () => {
    component.openEdit(event);
    component.editForm.patchValue({
      name: 'Updated event',
      venue: 'New Hall',
      starts_at: '2026-11-20T09:00',
      ends_at: '2026-11-20T17:00',
      capacity: 25,
      status: 'In progress',
    });

    component.saveEdit();

    expect(component.editingEvent()).toBeNull();
    expect(component.notice()).toContain('Updated event');
    expect(eventsService.eventById(event.id)?.name).toBe('Updated event');
    expect(eventsService.eventById(event.id)?.venue).toBe('New Hall');
  });

  it('should display error when required form fields are empty', () => {
    component.openEdit(event);
    component.editForm.patchValue({ name: '' });
    component.saveEdit();

    expect(component.editErrorMessage()).toBe('Please fill out all required fields properly.');
    expect(component.editingEvent()).not.toBeNull();
  });

  it('should reject saving when capacity is less than current registrations', () => {
    component.openEdit(event);
    component.editForm.patchValue({ capacity: 2 });
    component.saveEdit();

    expect(component.editErrorMessage()).toContain(
      `Capacity cannot be lower than current registrations (${event.registrations_count}).`,
    );
    expect(component.editingEvent()).not.toBeNull();
  });

  it('should reject saving when ends_at is before or equal to starts_at', () => {
    component.openEdit(event);
    component.editForm.patchValue({
      starts_at: '2026-11-20T17:00',
      ends_at: '2026-11-20T09:00',
    });
    component.saveEdit();

    expect(component.editErrorMessage()).toBe('End date & time must be after the start date & time.');
    expect(component.editingEvent()).not.toBeNull();
  });
});
