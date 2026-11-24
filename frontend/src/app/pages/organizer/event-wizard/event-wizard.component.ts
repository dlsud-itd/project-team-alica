import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import {
  NewOrganizerEvent,
  OrganizerEvent,
  StaffAccessLevel,
  WizardBooth,
  WizardEntrance,
  WizardStaffAssignment,
  WizardSubBooth,
} from '../../../core/organizer/organizer.models';
import { CategoryTagSelectorComponent } from '../../../shared/category-tag-selector/category-tag-selector.component';

export type WizardStep = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-event-wizard',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, CategoryTagSelectorComponent],
  templateUrl: './event-wizard.component.html',
  styleUrl: './event-wizard.component.scss',
})
export class EventWizardComponent {
  private readonly organizerEvents = inject(OrganizerEventsService);

  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<OrganizerEvent>();

  readonly currentStep = signal<WizardStep>(1);
  readonly errorMessage = signal('');
  readonly isSaving = signal(false);

  // Minimum date for event start
  readonly minStart = new Date().toISOString().slice(0, 16);

  // --- Step 1: Details ---
  readonly detailsForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('Conference', { nonNullable: true, validators: [Validators.required] }),
    tags: new FormControl<string[]>([], { nonNullable: true }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
    is_private: new FormControl(false, { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
  });

  readonly coOrganizerEmails = signal<string[]>([]);

  // --- Step 2: Entrances & Gates ---
  readonly entrances = signal<WizardEntrance[]>([]);
  readonly entranceName = signal('');
  readonly entranceLocation = signal('');
  readonly entranceAllowMultiScan = signal(false);
  readonly entranceError = signal('');

  // --- Step 3: Stations & Booths ---
  readonly booths = signal<WizardBooth[]>([]);
  readonly boothName = signal('');
  readonly boothLocation = signal('');
  readonly boothRequireMainEntry = signal(false);
  readonly boothAllowMultiScan = signal(true);
  readonly boothSubName = signal('');
  readonly boothError = signal('');

  // --- Step 4: Staff & Scanner Access ---
  readonly staffAssignments = signal<WizardStaffAssignment[]>([]);
  readonly staffEmail = signal('');
  readonly staffAccessLevel = signal<StaffAccessLevel>('ALL_SCANNERS');
  readonly staffCheckpointName = signal('');
  readonly staffError = signal('');

  // Available station options for restricted staff access
  readonly availableStations = computed(() => {
    const list: { name: string; type: string }[] = [];
    for (const ent of this.entrances()) {
      list.push({ name: ent.name, type: 'Entrance Gate' });
    }
    for (const booth of this.booths()) {
      list.push({ name: booth.name, type: 'Booth' });
    }
    return list;
  });

  // Step 1: Co-organizer methods
  addCoOrganizerEmail(input: HTMLInputElement): void {
    const email = input.value.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@') || !email.includes('.')) {
      this.errorMessage.set('Please enter a valid email address.');
      return;
    }
    if (this.coOrganizerEmails().includes(email)) {
      this.errorMessage.set('This organizer email has already been added.');
      return;
    }
    this.coOrganizerEmails.update((list) => [...list, email]);
    input.value = '';
    this.errorMessage.set('');
  }

  removeCoOrganizerEmail(index: number): void {
    this.coOrganizerEmails.update((list) => list.filter((_, i) => i !== index));
  }

  // Step 2: Entrance methods
  addDefaultEntrance(): void {
    const existing = this.entrances();
    if (existing.some((e) => e.name.toLowerCase() === 'main entrance - gate 1')) {
      return;
    }
    this.entrances.update((list) => [
      ...list,
      {
        name: 'Main Entrance - Gate 1',
        location: 'Ground Floor Lobby',
        allowMultipleScans: false,
      },
    ]);
  }

  addEntrance(): void {
    const name = this.entranceName().trim();
    if (!name) {
      this.entranceError.set('Entrance name is required.');
      return;
    }
    if (this.entrances().some((e) => e.name.toLowerCase() === name.toLowerCase())) {
      this.entranceError.set('An entrance with this name already exists.');
      return;
    }

    this.entrances.update((list) => [
      ...list,
      {
        name,
        location: this.entranceLocation().trim() || undefined,
        allowMultipleScans: this.entranceAllowMultiScan(),
      },
    ]);

    this.entranceName.set('');
    this.entranceLocation.set('');
    this.entranceAllowMultiScan.set(false);
    this.entranceError.set('');
  }

  removeEntrance(index: number): void {
    const removed = this.entrances()[index];
    this.entrances.update((list) => list.filter((_, i) => i !== index));
    // Also clean up any staff assigned to this entrance
    if (removed) {
      this.staffAssignments.update((list) =>
        list.filter(
          (s) =>
            s.accessLevel !== 'SPECIFIC_BOOTH' ||
            s.checkpointName?.toLowerCase() !== removed.name.toLowerCase(),
        ),
      );
    }
  }

  // Step 3: Booth methods
  addBooth(): void {
    const name = this.boothName().trim();
    if (!name) {
      this.boothError.set('Booth / Station name is required.');
      return;
    }
    if (this.booths().some((b) => b.name.toLowerCase() === name.toLowerCase())) {
      this.boothError.set('A booth with this name already exists.');
      return;
    }

    const subName = this.boothSubName().trim();
    const subBooths: WizardSubBooth[] = subName ? [{ name: subName }] : [];

    this.booths.update((list) => [
      ...list,
      {
        name,
        location: this.boothLocation().trim() || undefined,
        allowMultipleScans: this.boothAllowMultiScan(),
        requireMainEntry: this.boothRequireMainEntry(),
        subBooths: subBooths.length > 0 ? subBooths : undefined,
      },
    ]);

    this.boothName.set('');
    this.boothLocation.set('');
    this.boothSubName.set('');
    this.boothRequireMainEntry.set(false);
    this.boothAllowMultiScan.set(true);
    this.boothError.set('');
  }

  removeBooth(index: number): void {
    const removed = this.booths()[index];
    this.booths.update((list) => list.filter((_, i) => i !== index));
    if (removed) {
      this.staffAssignments.update((list) =>
        list.filter(
          (s) =>
            s.accessLevel !== 'SPECIFIC_BOOTH' ||
            s.checkpointName?.toLowerCase() !== removed.name.toLowerCase(),
        ),
      );
    }
  }

  // Step 4: Staff assignment methods
  addStaffAssignment(): void {
    const email = this.staffEmail().trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      this.staffError.set('Please enter a valid staff email address.');
      return;
    }

    const level = this.staffAccessLevel();
    const targetStation = this.staffCheckpointName().trim();

    if (level === 'SPECIFIC_BOOTH' && !targetStation) {
      this.staffError.set('Please select a specific entrance or booth.');
      return;
    }

    if (
      this.staffAssignments().some(
        (s) =>
          s.email === email &&
          (level === 'ALL_SCANNERS' || s.checkpointName === targetStation),
      )
    ) {
      this.staffError.set('This staff assignment already exists.');
      return;
    }

    this.staffAssignments.update((list) => [
      ...list,
      {
        email,
        accessLevel: level,
        checkpointName: level === 'SPECIFIC_BOOTH' ? targetStation : undefined,
      },
    ]);

    this.staffEmail.set('');
    this.staffError.set('');
  }

  removeStaffAssignment(index: number): void {
    this.staffAssignments.update((list) => list.filter((_, i) => i !== index));
  }

  // Step Navigation
  canProceedFromStep1(): boolean {
    if (this.detailsForm.invalid) {
      this.errorMessage.set('Please fill out all required event details.');
      return false;
    }
    const raw = this.detailsForm.getRawValue();
    const start = new Date(raw.starts_at);
    const end = new Date(raw.ends_at);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      this.errorMessage.set('Please provide valid start and end dates.');
      return false;
    }
    if (end <= start) {
      this.errorMessage.set('End date & time must be after the start date & time.');
      return false;
    }
    if (start <= new Date()) {
      this.errorMessage.set('Start date & time must be in the future.');
      return false;
    }

    this.errorMessage.set('');
    return true;
  }

  nextStep(): void {
    const current = this.currentStep();
    if (current === 1) {
      if (!this.canProceedFromStep1()) return;
      this.currentStep.set(2);
    } else if (current === 2) {
      this.currentStep.set(3);
    } else if (current === 3) {
      this.currentStep.set(4);
    } else if (current === 4) {
      this.currentStep.set(5);
    }
  }

  prevStep(): void {
    const current = this.currentStep();
    if (current > 1) {
      this.currentStep.update((s) => (s - 1) as WizardStep);
    }
  }

  goToStep(target: WizardStep): void {
    if (target === this.currentStep()) return;
    if (target > 1 && !this.canProceedFromStep1()) {
      return;
    }
    this.currentStep.set(target);
  }

  // Final Submission
  submitEvent(): void {
    if (!this.canProceedFromStep1()) {
      this.currentStep.set(1);
      return;
    }

    const raw = this.detailsForm.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);

    const payload: NewOrganizerEvent = {
      name: raw.name.trim(),
      description: raw.description.trim() || undefined,
      venue: raw.venue.trim(),
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      capacity: Number(raw.capacity),
      allow_walk_ins: raw.allow_walk_ins,
      is_private: raw.is_private,
      category: raw.category || 'Conference',
      tags: raw.tags || [],
      organizerEmails: this.coOrganizerEmails(),
      entrances: this.entrances().length > 0 ? this.entrances() : undefined,
      booths: this.booths().length > 0 ? this.booths() : undefined,
      staffAssignments:
        this.staffAssignments().length > 0 ? this.staffAssignments() : undefined,
    };

    this.isSaving.set(true);
    this.errorMessage.set('');

    this.organizerEvents.createEvent(payload).subscribe({
      next: (savedEvent) => {
        this.isSaving.set(false);
        this.saved.emit(savedEvent);
      },
      error: (err: HttpErrorResponse) => {
        this.isSaving.set(false);
        this.errorMessage.set(
          err.error?.message ?? 'Could not create event. Please try again.',
        );
      },
    });
  }
}
