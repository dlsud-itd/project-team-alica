import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventWizardComponent } from './event-wizard.component';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { OrganizerEvent } from '../../../core/organizer/organizer.models';

describe('EventWizardComponent', () => {
  let component: EventWizardComponent;
  let fixture: ComponentFixture<EventWizardComponent>;
  let mockOrganizerEvents: {
    createEvent: ReturnType<typeof vi.fn>;
    searchOrganizerCandidates: ReturnType<typeof vi.fn>;
  };

  const sampleEvent: OrganizerEvent = {
    id: 'evt-new-123',
    organizer_id: 'usr-1',
    name: 'Tech Summit 2026',
    venue: 'Grand Coliseum',
    starts_at: '2026-12-01T09:00:00Z',
    ends_at: '2026-12-01T17:00:00Z',
    capacity: 500,
    registrations_count: 0,
    status: 'Upcoming',
    description: '',
    allow_walk_ins: true,
    approval_status: 'Pending',
    review_notes: null,
    reviewed_at: null,
    submitted_at: new Date().toISOString(),
    category: 'Conference',
    tags: ['Tech'],
  };

  beforeEach(async () => {
    mockOrganizerEvents = {
      createEvent: vi.fn().mockReturnValue(of(sampleEvent)),
      searchOrganizerCandidates: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [EventWizardComponent],
      providers: [
        { provide: OrganizerEventsService, useValue: mockOrganizerEvents },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EventWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize at Step 1 with empty details', () => {
    expect(component.currentStep()).toBe(1);
    expect(component.detailsForm.valid).toBe(false);
    expect(component.entrances().length).toBe(0);
    expect(component.booths().length).toBe(0);
    expect(component.staffAssignments().length).toBe(0);
  });

  it('prevents advancing from Step 1 if required fields are missing', () => {
    component.nextStep();
    expect(component.currentStep()).toBe(1);
    expect(component.errorMessage()).toContain('Please fill out all required event details');
  });

  it('advances from Step 1 to Step 2 when form is valid', () => {
    const futureStart = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const futureEnd = new Date(Date.now() + 172800000).toISOString().slice(0, 16);

    component.detailsForm.patchValue({
      name: 'Hackathon 2026',
      venue: 'Main Gym',
      starts_at: futureStart,
      ends_at: futureEnd,
      capacity: 300,
      category: 'Hackathon',
      tags: ['AI', 'Web'],
    });

    component.nextStep();
    expect(component.currentStep()).toBe(2);
    expect(component.errorMessage()).toBe('');
  });

  it('configures default and custom entrances in Step 2', () => {
    component.currentStep.set(2);

    // Add default entrance
    component.addDefaultEntrance();
    expect(component.entrances().length).toBe(1);
    expect(component.entrances()[0].name).toBe('Main Entrance - Gate 1');

    // Add custom entrance
    component.entranceName.set('VIP Entrance');
    component.entranceLocation.set('Gate 2 West');
    component.entranceAllowMultiScan.set(true);
    component.addEntrance();

    expect(component.entrances().length).toBe(2);
    expect(component.entrances()[1].name).toBe('VIP Entrance');
    expect(component.entrances()[1].allowMultipleScans).toBe(true);

    // Remove first entrance
    component.removeEntrance(0);
    expect(component.entrances().length).toBe(1);
    expect(component.entrances()[0].name).toBe('VIP Entrance');
  });

  it('configures booths with sub-booths in Step 3', () => {
    component.currentStep.set(3);

    component.boothName.set('Robotics Showcase');
    component.boothLocation.set('Hall A');
    component.boothSubName.set('Demo Station 1');
    component.boothRequireMainEntry.set(true);
    component.addBooth();

    expect(component.booths().length).toBe(1);
    expect(component.booths()[0].name).toBe('Robotics Showcase');
    expect(component.booths()[0].requireMainEntry).toBe(true);
    expect(component.booths()[0].subBooths?.length).toBe(1);
    expect(component.booths()[0].subBooths?.[0].name).toBe('Demo Station 1');

    component.removeBooth(0);
    expect(component.booths().length).toBe(0);
  });

  it('assigns staff with ALL_SCANNERS and SPECIFIC_BOOTH access levels in Step 4', () => {
    component.entrances.set([{ name: 'Gate 1', location: 'Lobby' }]);
    component.booths.set([{ name: 'Cybersecurity Booth', location: 'Row C' }]);
    component.currentStep.set(4);

    // 1. Assign All Scanners staff
    component.staffEmail.set('general.staff@checkpoint.ph');
    component.staffAccessLevel.set('ALL_SCANNERS');
    component.addStaffAssignment();

    expect(component.staffAssignments().length).toBe(1);
    expect(component.staffAssignments()[0].email).toBe('general.staff@checkpoint.ph');
    expect(component.staffAssignments()[0].accessLevel).toBe('ALL_SCANNERS');

    // 2. Assign Specific Booth staff
    component.staffEmail.set('booth.operator@checkpoint.ph');
    component.staffAccessLevel.set('SPECIFIC_BOOTH');
    component.staffCheckpointName.set('Cybersecurity Booth');
    component.addStaffAssignment();

    expect(component.staffAssignments().length).toBe(2);
    expect(component.staffAssignments()[1].accessLevel).toBe('SPECIFIC_BOOTH');
    expect(component.staffAssignments()[1].checkpointName).toBe('Cybersecurity Booth');

    // 3. Remove staff
    component.removeStaffAssignment(0);
    expect(component.staffAssignments().length).toBe(1);
    expect(component.staffAssignments()[0].email).toBe('booth.operator@checkpoint.ph');
  });

  it('navigates through all steps and submits complete payload on Step 5', () => {
    const futureStart = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const futureEnd = new Date(Date.now() + 172800000).toISOString().slice(0, 16);

    component.detailsForm.patchValue({
      name: 'Full Wizard Event',
      venue: 'Main Auditorium',
      starts_at: futureStart,
      ends_at: futureEnd,
      capacity: 450,
      category: 'Conference',
      tags: ['Keynote', 'Tech'],
    });

    component.entrances.set([{ name: 'Main Gate', location: 'Lobby' }]);
    component.booths.set([{ name: 'Partner Booth', location: 'Hall 1' }]);
    component.staffAssignments.set([
      { email: 'staff1@alica.ph', accessLevel: 'ALL_SCANNERS' },
      { email: 'staff2@alica.ph', accessLevel: 'SPECIFIC_BOOTH', checkpointName: 'Partner Booth' },
    ]);

    const savedSpy = vi.fn();
    component.saved.subscribe(savedSpy);

    component.currentStep.set(5);
    component.submitEvent();

    expect(mockOrganizerEvents.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Full Wizard Event',
        venue: 'Main Auditorium',
        capacity: 450,
        category: 'Conference',
        tags: ['Keynote', 'Tech'],
        entrances: [{ name: 'Main Gate', location: 'Lobby' }],
        booths: [{ name: 'Partner Booth', location: 'Hall 1' }],
        staffAssignments: [
          { email: 'staff1@alica.ph', accessLevel: 'ALL_SCANNERS' },
          { email: 'staff2@alica.ph', accessLevel: 'SPECIFIC_BOOTH', checkpointName: 'Partner Booth' },
        ],
      }),
    );
    expect(savedSpy).toHaveBeenCalledWith(sampleEvent);
  });

  describe('co-organizer lookup & guest account invites', () => {
    it('searches candidates and selects registered user', async () => {
      const candidate = {
        id: 'usr-cand-1',
        email: 'userinsystem@gmail.com',
        fullName: 'Juan System',
        affiliation: 'CICS',
      };
      mockOrganizerEvents.searchOrganizerCandidates.mockReturnValue(of([candidate]));

      component.onCoOrgInput('userinsyst');
      expect(component.coOrgInputText()).toBe('userinsyst');
      expect(component.showCoOrgDropdown()).toBe(true);

      // Select candidate
      component.selectCandidate(candidate);
      expect(component.coOrganizerEmails()).toEqual(['userinsystem@gmail.com']);
      expect(component.coOrganizerMetadata()['userinsystem@gmail.com']).toEqual({
        fullName: 'Juan System',
        isRegistered: true,
      });
      expect(component.coOrgInputText()).toBe('');
      expect(component.showCoOrgDropdown()).toBe(false);
    });

    it('adds unregistered user as a guest invite', () => {
      component.onCoOrgInput('usernotinsystem@gmail.com');
      component.addCoOrganizerEmail();

      expect(component.coOrganizerEmails()).toEqual(['usernotinsystem@gmail.com']);
      expect(component.coOrganizerMetadata()['usernotinsystem@gmail.com']).toEqual({
        fullName: 'usernotinsystem',
        isRegistered: false,
      });
    });

    it('removes co-organizer and clears metadata', () => {
      component.addCoOrganizerEmail('co1@example.com');
      component.addCoOrganizerEmail('co2@example.com');
      expect(component.coOrganizerEmails().length).toBe(2);

      component.removeCoOrganizerEmail(0);
      expect(component.coOrganizerEmails()).toEqual(['co2@example.com']);
      expect(component.coOrganizerMetadata()['co1@example.com']).toBeUndefined();
    });
  });

  describe('staff email lookup & autofill in Step 4', () => {
    it('searches staff candidates and selects candidate to autofill staffEmail', () => {
      const candidate = {
        id: 'usr-staff-1',
        email: 'staff.operator@alica.ph',
        fullName: 'Staff Operator',
        affiliation: 'Security',
      };
      mockOrganizerEvents.searchOrganizerCandidates.mockReturnValue(of([candidate]));

      component.onStaffEmailInput('staff.op');
      expect(component.staffEmail()).toBe('staff.op');
      expect(component.showStaffDropdown()).toBe(true);

      component.selectStaffCandidate(candidate);
      expect(component.staffEmail()).toBe('staff.operator@alica.ph');
      expect(component.showStaffDropdown()).toBe(false);
      expect(component.staffCandidates()).toEqual([]);
    });

    it('resets dropdown when adding staff assignment', () => {
      component.staffEmail.set('scanner.duty@checkpoint.ph');
      component.staffAccessLevel.set('ALL_SCANNERS');
      component.showStaffDropdown.set(true);

      component.addStaffAssignment();

      expect(component.staffAssignments().some((s) => s.email === 'scanner.duty@checkpoint.ph')).toBe(true);
      expect(component.staffEmail()).toBe('');
      expect(component.showStaffDropdown()).toBe(false);
    });
  });
});
