import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';
import { environment } from '../../../../environments/environment';
import { EventOverviewComponent } from './event-overview.component';

const MOCK_EVENT: OrganizerEvent = {
  id: 'evt-1',
  organizer_id: 'usr-org',
  name: 'Campus Tech Summit',
  starts_at: '2026-11-20T08:00:00.000Z',
  ends_at: '2026-11-20T17:00:00.000Z',
  venue: 'Ugnayang La Salle',
  registrations_count: 5,
  capacity: 250,
  status: 'Upcoming',
  description: 'Annual student tech gathering.',
  allow_walk_ins: true,
  require_student_id: true,
  approval_status: 'Approved',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-01T00:00:00.000Z',
  is_private: false,
  category: 'Conference',
  category_label: 'Conference',
  tags: ['AI', 'Students'],
  banner_image_url: 'data:image/jpeg;base64,mockbanner',
  schedule: [
    {
      id: 'sch-1',
      time: '09:00 AM',
      title: 'Opening Keynote',
      description: 'Welcome address',
      type: 'KEYNOTE',
      location: 'Main Hall',
      checkpointId: 'chk-1',
    },
  ],
  speakers: [
    {
      id: 'spk-1',
      name: 'Dr. Maria Santos',
      role: 'Dean',
      company: 'CSCS',
      topic: 'AI on Campus',
      avatarUrl: 'https://example.com/avatar.jpg',
    },
  ],
  organizers: [
    {
      id: 'primary-usr-org',
      userId: 'usr-org',
      email: 'o@alica.ph',
      fullName: 'Org Lead',
      affiliation: 'USC',
      assignedAt: '2026-10-01T00:00:00.000Z',
      isPrimary: true,
    },
  ],
};

describe('EventOverviewComponent', () => {
  let fixture: ComponentFixture<EventOverviewComponent>;
  let component: EventOverviewComponent;
  let httpTesting: HttpTestingController;
  let userSignal: ReturnType<typeof signal<any>>;
  let eventsSignal: ReturnType<typeof signal<OrganizerEvent[]>>;
  let updateEventMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    userSignal = signal({ id: 'usr-org', email: 'o@alica.ph', fullName: 'Org Lead', role: 'USER' });
    eventsSignal = signal([{ ...MOCK_EVENT }]);
    updateEventMock = vi.fn((eventId: string, changes: Partial<OrganizerEvent>) => {
      const updated = { ...eventsSignal()[0], ...changes };
      eventsSignal.set([updated]);
      return of(updated);
    });

    await TestBed.configureTestingModule({
      imports: [EventOverviewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { parent: { paramMap: of(new Map([['eventId', 'evt-1']])) } },
        },
        {
          provide: AuthService,
          useValue: { user: userSignal, isAuthenticated: () => true, getProfiles: () => of([]) },
        },
        {
          provide: OrganizerEventsService,
          useValue: {
            events: eventsSignal,
            eventsLoaded: () => true,
            loading: () => false,
            loadEvents: () => of(eventsSignal()),
            updateEvent: updateEventMock,
          },
        },
        {
          provide: SubBoothApi,
          useValue: {
            listByEvent: () =>
              of([
                {
                  id: 'chk-1',
                  name: 'Main Gate',
                  location: 'Lobby',
                  type: 'MAIN_ENTRY',
                  allowMultipleScans: false,
                  requireMainEntry: false,
                  eventId: 'evt-1',
                  eventName: 'Campus Tech Summit',
                  parentId: null,
                },
              ]),
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EventOverviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders editable overview sections for organizers without calling attendee preview immediately', () => {
    httpTesting.expectNone(`${environment.apiUrl}/events/evt-1`);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Editable overview');
    expect(el.textContent).toContain('Campus Tech Summit');
    expect(el.textContent).toContain('#AI');
    expect(el.textContent).toContain('Opening Keynote');
    expect(el.textContent).toContain('Scanned at: Main Gate');
    expect(el.textContent).toContain('Dr. Maria Santos');
    expect(el.textContent).toContain('Student ID required');
  });

  it('toggles into attendee preview and shows read-only preview for non-organizer staff', () => {
    component.togglePreview();
    fixture.detectChanges();
    const previewReq = httpTesting.expectOne(`${environment.apiUrl}/events/evt-1`);
    expect(previewReq.request.method).toBe('GET');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-event-details')).toBeTruthy();

    component.togglePreview();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-event-details')).toBeNull();

    userSignal.set({ id: 'usr-staff', email: 's@alica.ph', fullName: 'Staff', role: 'USER' });
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/events/evt-1`);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-event-details')).toBeTruthy();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Open public page');
  });

  it('edits hero title, about description/tags, and key details inline and persists immediately', () => {
    component.startEditTitle();
    component.titleForm.patchValue({ name: 'Summit Reloaded' });
    component.saveTitle();
    expect(updateEventMock).toHaveBeenCalledWith('evt-1', { name: 'Summit Reloaded' });
    expect(component.editingTitle()).toBe(false);

    component.startEditAbout();
    component.aboutForm.patchValue({
      description: 'Updated description',
      category: 'Hackathon',
      tags: ['Coding', '24-Hour'],
    });
    component.saveAbout();
    expect(updateEventMock).toHaveBeenCalledWith('evt-1', {
      description: 'Updated description',
      category: 'Hackathon',
      tags: ['Coding', '24-Hour'],
    });
    expect(component.editingAbout()).toBe(false);

    component.startEditDetails();
    component.detailsForm.patchValue({
      venue: 'Auditorium',
      starts_at: '2026-11-21T09:00',
      ends_at: '2026-11-21T18:00',
      capacity: 300,
      require_student_id: false,
    });
    component.saveDetails();
    expect(updateEventMock).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        venue: 'Auditorium',
        capacity: 300,
        require_student_id: false,
      }),
    );
    expect(component.editingDetails()).toBe(false);
  });

  it('validates invalid date ranges and capacity lower than registrations in key details', () => {
    component.startEditDetails();
    component.detailsForm.patchValue({
      starts_at: '2026-11-21T18:00',
      ends_at: '2026-11-21T09:00',
    });
    component.saveDetails();
    expect(component.detailsError()).toContain('End date & time must be after');

    component.detailsForm.patchValue({
      starts_at: '2026-11-21T09:00',
      ends_at: '2026-11-21T18:00',
      capacity: 2, // registrations_count is 5
    });
    component.saveDetails();
    expect(component.detailsError()).toContain('Capacity cannot be lower');
    expect(updateEventMock).not.toHaveBeenCalled();
  });

  it('validates banner uploads and resets custom banner immediately', () => {
    const invalidFile = new File(['bad'], 'doc.pdf', { type: 'application/pdf' });
    component.onBannerSelected({ target: { files: [invalidFile], value: '' } } as unknown as Event);
    expect(component.bannerError()).toContain('valid image file');

    const bigBlob = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/png' });
    const bigFile = new File([bigBlob], 'large.png', { type: 'image/png' });
    component.onBannerSelected({ target: { files: [bigFile], value: '' } } as unknown as Event);
    expect(component.bannerError()).toContain('less than 2MB');

    component.removeBanner();
    expect(updateEventMock).toHaveBeenCalledWith('evt-1', { banner_image_url: null });
  });

  it('adds, edits, and removes program schedule items immediately', () => {
    component.openAddScheduleModal();
    component.scheduleItemForm.patchValue({
      time: '02:00 PM',
      title: 'Cloud Workshop',
      type: 'WORKSHOP',
      location: 'Lab 2',
      description: 'Hands-on labs',
    });
    component.saveScheduleItem();
    expect(updateEventMock).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        schedule: expect.arrayContaining([
          expect.objectContaining({ title: 'Opening Keynote' }),
          expect.objectContaining({ title: 'Cloud Workshop', type: 'WORKSHOP' }),
        ]),
      }),
    );
    expect(component.scheduleModalOpen()).toBe(false);

    component.openEditScheduleModal(1);
    component.scheduleItemForm.patchValue({ title: 'Advanced Cloud Workshop' });
    component.saveScheduleItem();
    expect(component.scheduleItems()[1].title).toBe('Advanced Cloud Workshop');

    component.removeScheduleItem(0);
    expect(component.scheduleItems()).toHaveLength(1);
    expect(component.scheduleItems()[0].title).toBe('Advanced Cloud Workshop');
  });

  it('adds, edits, and removes featured speakers immediately while keeping existing avatarUrl', () => {
    component.openAddSpeakerModal();
    component.speakerForm.patchValue({
      name: 'Alex Mercer',
      role: 'Architect',
      company: 'DataForge',
      topic: 'Distributed Systems',
    });
    component.saveSpeakerItem();
    expect(updateEventMock).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({
        speakers: expect.arrayContaining([
          expect.objectContaining({ name: 'Dr. Maria Santos' }),
          expect.objectContaining({ name: 'Alex Mercer', company: 'DataForge' }),
        ]),
      }),
    );
    expect(component.speakerModalOpen()).toBe(false);

    component.openEditSpeakerModal(0);
    component.speakerForm.patchValue({ role: 'Keynote Chair' });
    component.saveSpeakerItem();
    expect(component.speakers()[0]).toMatchObject({
      name: 'Dr. Maria Santos',
      role: 'Keynote Chair',
      avatarUrl: 'https://example.com/avatar.jpg',
    });

    component.removeSpeakerItem(1);
    expect(component.speakers()).toHaveLength(1);
  });

  it('keeps modal open and shows error if saving speaker fails', () => {
    updateEventMock.mockReturnValueOnce(throwError(() => ({ error: { message: 'Server unavailable' } })));
    component.openAddSpeakerModal();
    component.speakerForm.patchValue({ name: 'Failing Save' });
    component.saveSpeakerItem();
    expect(component.speakerModalOpen()).toBe(true);
    expect(component.speakerError()).toBe('Server unavailable');
  });
});
