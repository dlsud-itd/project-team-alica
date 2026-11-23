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
  organizers: [],
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

  it('should remove an event after the delete is confirmed', () => {
    const targetEvent = component.events()[0];
    component.openDelete(targetEvent);
    fixture.detectChanges();
    expect(component.deletingEvent()).toEqual(targetEvent);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Delete Event');

    component.confirmDelete();
    fixture.detectChanges();

    expect(component.deletingEvent()).toBeNull();
    expect(component.events()).toEqual([]);
    expect(component.notice()).toContain(targetEvent.name);
  });

  it('should render KPI summary cards and accurate event visibility', () => {
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Organized Events');
    expect(text).toContain('Total Registrations');
    expect(text).toContain('Upcoming Events');
    expect(text).toContain('Open Seats');
    expect(text).toContain('Public');
  });

  describe('co-organizers support in dashboard', () => {
    it('allows adding and removing co-organizer emails', () => {
      component.openCreate();
      const mockInput = { value: 'coorg1@dlsud.edu.ph' } as HTMLInputElement;

      component.addCoOrganizerEmail(mockInput);
      expect(component.coOrganizerEmails()).toEqual(['coorg1@dlsud.edu.ph']);
      expect(mockInput.value).toBe('');

      // add another
      mockInput.value = 'coorg2@dlsud.edu.ph';
      component.addCoOrganizerEmail(mockInput);
      expect(component.coOrganizerEmails().length).toBe(2);

      // reject duplicate
      mockInput.value = 'coorg1@dlsud.edu.ph';
      component.addCoOrganizerEmail(mockInput);
      expect(component.coOrganizerEmails().length).toBe(2);

      // reject invalid email
      mockInput.value = 'not-an-email';
      component.addCoOrganizerEmail(mockInput);
      expect(component.editErrorMessage()).toContain('valid email');
      expect(component.coOrganizerEmails().length).toBe(2);

      // remove by index
      component.removeCoOrganizerEmail(0);
      expect(component.coOrganizerEmails()).toEqual(['coorg2@dlsud.edu.ph']);
    });

    it('pre-populates co-organizers on openEdit excluding primary organizer', () => {
      const eventWithOrgs: OrganizerEvent = {
        ...EVENT,
        organizers: [
          {
            id: 'eo-1',
            userId: 'usr-org',
            email: 'primary@dlsud.edu.ph',
            fullName: 'Primary Organizer',
            affiliation: 'CICS',
            isPrimary: true,
            assignedAt: '2026-10-01T00:00:00.000Z',
          },
          {
            id: 'eo-2',
            userId: 'usr-co1',
            email: 'partner@dlsud.edu.ph',
            fullName: 'Partner Organizer',
            affiliation: 'CICS',
            isPrimary: false,
            assignedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
      };

      component.openEdit(eventWithOrgs);
      expect(component.coOrganizerEmails()).toEqual(['partner@dlsud.edu.ph']);
    });

    it('fetches organizers from API when event.organizers is undefined on openEdit', () => {
      const eventWithoutOrgs: OrganizerEvent = {
        ...EVENT,
        organizers: undefined,
      };

      component.openEdit(eventWithoutOrgs);
      const req = httpMock.expectOne(`${API}/${eventWithoutOrgs.id}/organizers`);
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        data: [
          {
            id: 'eo-10',
            userId: 'usr-org',
            email: 'primary@dlsud.edu.ph',
            fullName: 'Primary Organizer',
            affiliation: null,
            isPrimary: true,
            assignedAt: '2026-10-01T00:00:00.000Z',
          },
          {
            id: 'eo-11',
            userId: 'usr-co2',
            email: 'co2@dlsud.edu.ph',
            fullName: 'Co-Organizer Two',
            affiliation: null,
            isPrimary: false,
            assignedAt: '2026-10-02T00:00:00.000Z',
          },
        ],
      });

      expect(component.coOrganizerEmails()).toEqual(['co2@dlsud.edu.ph']);
    });

    it('includes organizerEmails when saving an edited event', () => {
      const targetEvent = component.events()[0];
      component.openEdit(targetEvent);

      const mockInput = { value: 'added-coorg@dlsud.edu.ph' } as HTMLInputElement;
      component.addCoOrganizerEmail(mockInput);

      component.editForm.patchValue({
        name: 'Tech Summit With Co-org',
        venue: 'Gymnasium',
        starts_at: '2026-11-20T09:00',
        ends_at: '2026-11-20T17:00',
        capacity: 50,
      });

      component.saveEdit();

      const req = httpMock.expectOne(`${API}/${targetEvent.id}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.organizerEmails).toEqual(['added-coorg@dlsud.edu.ph']);
      req.flush({
        success: true,
        data: { ...targetEvent, name: 'Tech Summit With Co-org' },
      });
      expect(component.editingEvent()).toBeNull();
    });
  });
});
