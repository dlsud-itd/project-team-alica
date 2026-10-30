import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OrganizerDashboard } from './dashboard.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';

describe('OrganizerDashboard', () => {
  let component: OrganizerDashboard;
  let fixture: ComponentFixture<OrganizerDashboard>;
  let eventsService: OrganizerEventsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerDashboard],
      providers: [provideRouter([])],
    }).compileComponents();

    eventsService = TestBed.inject(OrganizerEventsService);
    fixture = TestBed.createComponent(OrganizerDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should open edit modal with pre-populated values when openEdit is called', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    expect(component.editingEvent()).toEqual(targetEvent);
    expect(component.editForm.value.name).toBe(targetEvent.name);
    expect(component.editForm.value.venue).toBe(targetEvent.venue);
    expect(component.editForm.value.city).toBe(targetEvent.city);
    expect(component.editForm.value.capacity).toBe(targetEvent.capacity);
    expect(component.editForm.value.status).toBe(targetEvent.status);
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

  it('should update event and show notice when valid changes are saved', () => {
    const targetEvent = component.events()[0];
    component.openEdit(targetEvent);

    component.editForm.patchValue({
      name: 'Updated Tech Summit 2026',
      venue: 'New Grand Hall',
      city: 'Dasmarinas City',
      starts_at: '2026-11-20T09:00',
      ends_at: '2026-11-20T17:00',
      capacity: 25,
      status: 'In progress',
    });

    component.saveEdit();

    expect(component.editingEvent()).toBeNull();
    expect(component.notice()).toContain('Updated Tech Summit 2026');

    const updated = eventsService.eventById(targetEvent.id);
    expect(updated?.name).toBe('Updated Tech Summit 2026');
    expect(updated?.venue).toBe('New Grand Hall');
    expect(updated?.city).toBe('Dasmarinas City');
    expect(updated?.capacity).toBe(25);
    expect(updated?.status).toBe('In progress');
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
});
