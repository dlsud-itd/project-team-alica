import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventOrganizer, OrganizerEvent } from '../../../core/organizer/organizer.models';
import { EventSettingsComponent } from './event_settings.component';

const MOCK_EVENT: OrganizerEvent = {
  id: 'evt-settings-1',
  organizer_id: 'usr-primary-org',
  name: 'Innovation Summit 2026',
  starts_at: '2026-11-20T08:00:00.000Z',
  ends_at: '2026-11-20T17:00:00.000Z',
  venue: 'Innovation Hall',
  registrations_count: 5,
  capacity: 200,
  status: 'Upcoming',
  description: 'Flagship innovation event',
  allow_walk_ins: true,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-01T00:00:00.000Z',
  is_private: false,
  category: 'CONFERENCE',
  banner_image_url: 'https://images.unsplash.com/photo-mock',
  schedule: [
    {
      id: 'sch-1',
      time: '09:00 AM',
      title: 'Opening Keynote',
      type: 'KEYNOTE',
      location: 'Grand Ballroom',
      description: 'Opening and welcomes',
    },
  ],
};

const MOCK_ORGANIZERS: EventOrganizer[] = [
  {
    id: 'primary-usr-primary-org',
    userId: 'usr-primary-org',
    email: 'primary@alica.ph',
    fullName: 'Primary Organizer',
    affiliation: 'CSCS',
    assignedAt: '2026-10-01T00:00:00.000Z',
    isPrimary: true,
  },
  {
    id: 'eo-co-1',
    userId: 'usr-co-1',
    email: 'coorganizer@alica.ph',
    fullName: 'Co Organizer',
    affiliation: 'USC',
    assignedAt: '2026-10-05T00:00:00.000Z',
    isPrimary: false,
  },
];

describe('EventSettingsComponent', () => {
  let component: EventSettingsComponent;
  let fixture: ComponentFixture<EventSettingsComponent>;
  let mockOrganizerEvents: {
    events: () => OrganizerEvent[];
    eventsLoaded: () => boolean;
    loadEvents: ReturnType<typeof vi.fn>;
    loadOrganizers: ReturnType<typeof vi.fn>;
    addOrganizer: ReturnType<typeof vi.fn>;
    removeOrganizer: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
    deleteEvent: ReturnType<typeof vi.fn>;
  };
  let mockAuth: {
    user: () => { id: string; role: string; fullName: string; email: string } | null;
  };
  let mockRouter: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockOrganizerEvents = {
      events: () => [MOCK_EVENT],
      eventsLoaded: () => true,
      loadEvents: vi.fn().mockReturnValue(of([MOCK_EVENT])),
      loadOrganizers: vi.fn().mockReturnValue(of(MOCK_ORGANIZERS)),
      addOrganizer: vi.fn().mockReturnValue(
        of({
          id: 'eo-new',
          userId: 'usr-new',
          email: 'newco@alica.ph',
          fullName: 'New Co',
          affiliation: null,
          assignedAt: new Date().toISOString(),
          isPrimary: false,
        }),
      ),
      removeOrganizer: vi.fn().mockReturnValue(of(undefined)),
      updateEvent: vi.fn().mockReturnValue(
        of({ ...MOCK_EVENT, name: 'Renamed Summit 2026' }),
      ),
      deleteEvent: vi.fn().mockReturnValue(of(undefined)),
    };

    mockAuth = {
      user: () => ({
        id: 'usr-primary-org',
        role: 'ORGANIZER',
        fullName: 'Primary Organizer',
        email: 'primary@alica.ph',
      }),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [EventSettingsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            parent: {
              paramMap: of({ get: () => 'evt-settings-1' }),
            },
            snapshot: {
              paramMap: { get: () => 'evt-settings-1' },
            },
          },
        },
        { provide: OrganizerEventsService, useValue: mockOrganizerEvents },
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and populate event parameters form', () => {
    expect(component).toBeTruthy();
    expect(component.eventId()).toBe('evt-settings-1');
    expect(component.generalForm.get('name')?.value).toBe('Innovation Summit 2026');
    expect(component.generalForm.get('venue')?.value).toBe('Innovation Hall');
    expect(component.generalForm.get('capacity')?.value).toBe(200);
  });

  it('should load organizers and distinguish primary from co-organizers', () => {
    expect(mockOrganizerEvents.loadOrganizers).toHaveBeenCalledWith('evt-settings-1');
    expect(component.organizers().length).toBe(2);
    expect(component.primaryOrganizer()?.email).toBe('primary@alica.ph');
    expect(component.coOrganizers().length).toBe(1);
    expect(component.coOrganizers()[0].email).toBe('coorganizer@alica.ph');
  });

  it('should save general settings successfully', () => {
    component.generalForm.patchValue({
      name: 'Renamed Summit 2026',
    });

    component.saveGeneralSettings();

    expect(mockOrganizerEvents.updateEvent).toHaveBeenCalledWith(
      'evt-settings-1',
      expect.objectContaining({
        name: 'Renamed Summit 2026',
        venue: 'Innovation Hall',
      }),
    );
    expect(component.generalSuccess()).toContain('Renamed Summit 2026');
  });

  it('should reject invalid dates or capacity lower than registrations', () => {
    component.generalForm.patchValue({
      starts_at: '2026-11-20T18:00',
      ends_at: '2026-11-20T08:00',
    });
    component.saveGeneralSettings();
    expect(component.generalError()).toContain('End date & time must be after');

    component.generalForm.patchValue({
      starts_at: '2026-11-20T08:00',
      ends_at: '2026-11-20T17:00',
      capacity: 2, // lower than registrations_count (5)
    });
    component.saveGeneralSettings();
    expect(component.generalError()).toContain('Capacity cannot be lower');
  });

  it('should add a co-organizer member', () => {
    const input = document.createElement('input');
    input.value = 'newco@alica.ph';

    component.addOrganizerMember(input);

    expect(mockOrganizerEvents.addOrganizer).toHaveBeenCalledWith('evt-settings-1', 'newco@alica.ph');
    expect(input.value).toBe('');
    expect(component.organizerSuccess()).toContain('newco@alica.ph');
  });

  it('should remove a co-organizer member', () => {
    component.removeOrganizerMember('usr-co-1');

    expect(mockOrganizerEvents.removeOrganizer).toHaveBeenCalledWith('evt-settings-1', 'usr-co-1');
    expect(component.organizerSuccess()).toContain('Co-organizer removed');
  });

  it('should populate category, banner image, and schedule', () => {
    expect(component.generalForm.get('category')?.value).toBe('CONFERENCE');
    expect(component.bannerImageUrl()).toBe('https://images.unsplash.com/photo-mock');
    expect(component.scheduleItems().length).toBe(1);
    expect(component.scheduleItems()[0].title).toBe('Opening Keynote');
  });

  it('should allow adding, editing, and removing schedule items', () => {
    // Open add session modal
    component.openAddScheduleItem();
    expect(component.scheduleFormOpen()).toBe(true);
    expect(component.editingScheduleIndex()).toBeNull();

    // Fill and save new session
    component.scheduleItemForm.patchValue({
      time: '11:00 AM',
      title: 'DevOps Workshop',
      type: 'WORKSHOP',
      location: 'Lab 3',
      description: 'Hands-on CI/CD',
    });
    component.saveScheduleItem();
    expect(component.scheduleFormOpen()).toBe(false);
    expect(component.scheduleItems().length).toBe(2);
    expect(component.scheduleItems()[1].title).toBe('DevOps Workshop');

    // Open edit session
    component.openEditScheduleItem(1);
    expect(component.scheduleFormOpen()).toBe(true);
    expect(component.editingScheduleIndex()).toBe(1);
    expect(component.scheduleItemForm.get('title')?.value).toBe('DevOps Workshop');

    // Update title and save
    component.scheduleItemForm.patchValue({ title: 'Advanced DevOps Workshop' });
    component.saveScheduleItem();
    expect(component.scheduleItems()[1].title).toBe('Advanced DevOps Workshop');

    // Remove session
    component.removeScheduleItem(0);
    expect(component.scheduleItems().length).toBe(1);
    expect(component.scheduleItems()[0].title).toBe('Advanced DevOps Workshop');
  });

  it('should validate and handle cover image selection and removal', () => {
    // Invalid type
    const invalidFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
    const invalidEvent = { target: { files: [invalidFile], value: '' } } as unknown as Event;
    component.onImageSelected(invalidEvent);
    expect(component.imageError()).toContain('valid image file');

    // Size limit (> 2MB)
    const bigBlob = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/png' });
    const oversizedFile = new File([bigBlob], 'huge.png', { type: 'image/png' });
    const oversizedEvent = { target: { files: [oversizedFile], value: '' } } as unknown as Event;
    component.onImageSelected(oversizedEvent);
    expect(component.imageError()).toContain('less than 2MB');

    // Removal
    component.removeImage();
    expect(component.bannerImageUrl()).toBeNull();
    expect(component.imageError()).toBe('');
  });

  it('should include category, banner image, and schedule in saveGeneralSettings', () => {
    component.generalForm.patchValue({
      category: 'WORKSHOP',
    });
    component.removeImage();

    component.saveGeneralSettings();

    expect(mockOrganizerEvents.updateEvent).toHaveBeenCalledWith(
      'evt-settings-1',
      expect.objectContaining({
        category: 'WORKSHOP',
        banner_image_url: null,
        schedule: expect.any(Array),
      }),
    );
  });

  it('should confirm delete and navigate to /hub', () => {
    component.openDelete();
    expect(component.deleting()).toBe(true);

    component.confirmDelete();
    expect(mockOrganizerEvents.deleteEvent).toHaveBeenCalledWith('evt-settings-1');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/hub']);
  });
});

