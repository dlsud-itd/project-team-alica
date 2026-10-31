import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { OrganizerDashboard } from './dashboard.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

const API = `${environment.apiUrl}/events`;

const EVENT: OrganizerEvent = {
  id: 'evt-1',
  organizer_id: 'usr-org',
  name: 'Tech Summit 2026',
  starts_at: '2026-11-15T00:00:00.000Z',
  ends_at: '2026-11-15T09:00:00.000Z',
  venue: 'Gymnasium',
  registrations_count: 4,
  capacity: 10,
  status: 'Upcoming',
  description: '',
  allow_walk_ins: false,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-01T00:00:00.000Z',
};

describe('OrganizerDashboard', () => {
  let component: OrganizerDashboard;
  let fixture: ComponentFixture<OrganizerDashboard>;
  let eventsService: OrganizerEventsService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    eventsService = TestBed.inject(OrganizerEventsService);
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(OrganizerDashboard);
    component = fixture.componentInstance;
    httpMock.expectOne(`${API}/mine`).flush({ success: true, data: [EVENT] });
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create and show events loaded from the API', () => {
    expect(component).toBeTruthy();
    expect(component.events()).toEqual([EVENT]);
  });

  it('should open edit modal with pre-populated values when openEdit is called', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    expect(component.editingEvent()).toEqual(targetEvent);
    expect(component.editForm.value.name).toBe(targetEvent.name);
    expect(component.editForm.value.venue).toBe(targetEvent.venue);
    expect(component.editForm.value.capacity).toBe(targetEvent.capacity);
    expect(component.editErrorMessage()).toBe('');
  });

  it('should close edit modal and reset form when closeEdit is called', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);
    expect(component.editingEvent()).not.toBeNull();

    component.closeEdit();
    expect(component.editingEvent()).toBeNull();
    expect(component.editErrorMessage()).toBe('');
  });

  it('should save valid changes to the API and show notice', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    component.editForm.patchValue({
      name: 'Updated Tech Summit 2026',
      venue: 'New Grand Hall',
      starts_at: '2026-11-20T09:00',
      ends_at: '2026-11-20T17:00',
      capacity: 25,
    });

    component.saveEdit();

    const req = httpMock.expectOne(`${API}/${targetEvent.id}`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toMatchObject({
      name: 'Updated Tech Summit 2026',
      venue: 'New Grand Hall',
      capacity: 25,
    });
    req.flush({
      success: true,
      data: { ...targetEvent, name: 'Updated Tech Summit 2026', venue: 'New Grand Hall', capacity: 25 },
    });

    expect(component.editingEvent()).toBeNull();
    expect(component.notice()).toContain('Updated Tech Summit 2026');

    const updated = eventsService.eventById(targetEvent.id);
    expect(updated?.name).toBe('Updated Tech Summit 2026');
    expect(updated?.venue).toBe('New Grand Hall');
    expect(updated?.capacity).toBe(25);
  });

  it('should keep the modal open and show the API error when saving fails', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);
    component.saveEdit();

    httpMock
      .expectOne(`${API}/${targetEvent.id}`)
      .flush({ message: 'You do not manage this event' }, { status: 403, statusText: 'Forbidden' });

    expect(component.editErrorMessage()).toBe('You do not manage this event');
    expect(component.editingEvent()).not.toBeNull();
  });

  it('should display error when required form fields are empty', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    component.editForm.patchValue({
      name: '',
    });

    component.saveEdit();

    expect(component.editErrorMessage()).toBe('Please fill out all required fields properly.');
    expect(component.editingEvent()).not.toBeNull();
  });

  it('should reject saving when capacity is less than current registrations', () => {
    const targetEvent = component.events()[0]; // registrations_count is 4
    component.openEdit(targetEvent);

    component.editForm.patchValue({
      capacity: 2,
    });

    component.saveEdit();

    expect(component.editErrorMessage()).toContain(
      `Capacity cannot be lower than current registrations (${targetEvent.registrations_count}).`,
    );
    expect(component.editingEvent()).not.toBeNull();
  });

  it('should reject saving when ends_at is before or equal to starts_at', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    component.editForm.patchValue({
      starts_at: '2026-11-20T17:00',
      ends_at: '2026-11-20T09:00',
    });

    component.saveEdit();

    expect(component.editErrorMessage()).toBe('End date & time must be after the start date & time.');
    expect(component.editingEvent()).not.toBeNull();
  });

  describe('creating an event', () => {
    const fillForm = (overrides: Record<string, unknown> = {}) =>
      component.editForm.patchValue({
        name: 'AI Workshop',
        description: 'Hands-on agent building',
        venue: 'CBAA Lab 1',
        starts_at: '2099-12-01T09:00',
        ends_at: '2099-12-01T12:00',
        capacity: 40,
        allow_walk_ins: true,
        ...overrides,
      });

    it('should open an empty create dialog', () => {
      component.openCreate();
      expect(component.creating()).toBe(true);
      expect(component.dialogOpen()).toBe(true);
      expect(component.editingEvent()).toBeNull();
      expect(component.editForm.value.name).toBe('');
    });

    it('should submit the new event for approval and show a notice', () => {
      component.openCreate();
      fillForm();
      component.saveEdit();

      const req = httpMock.expectOne(API);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toMatchObject({
        name: 'AI Workshop',
        venue: 'CBAA Lab 1',
        capacity: 40,
        allow_walk_ins: true,
      });
      req.flush({
        success: true,
        data: {
          ...EVENT,
          id: 'evt-2',
          name: 'AI Workshop',
          registrations_count: 0,
          approval_status: 'Pending',
        },
      });

      expect(component.dialogOpen()).toBe(false);
      expect(component.notice()).toContain('awaiting admin approval');
      expect(component.pendingEvents()).toBe(1);
    });

    it('should reject a start date in the past', () => {
      component.openCreate();
      fillForm({ starts_at: '2020-01-01T09:00', ends_at: '2020-01-01T12:00' });
      component.saveEdit();

      expect(component.editErrorMessage()).toBe('Start date & time must be in the future.');
      expect(component.creating()).toBe(true);
    });
  });
});
