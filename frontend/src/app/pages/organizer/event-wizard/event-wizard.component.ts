import { DatePipe } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import {
  NewOrganizerEvent,
  OrganizerCandidate,
  OrganizerEvent,
  StaffAccessLevel,
  WizardBooth,
  WizardEntrance,
  WizardSpeaker,
  WizardStaffAssignment,
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

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

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

  readonly isPrivateEvent = toSignal(
    this.detailsForm.controls.is_private.valueChanges,
    { initialValue: this.detailsForm.controls.is_private.value }
  );

  // --- Step 1: Banner Image ---
  readonly bannerImageUrl = signal<string | null>(null);
  readonly imageError = signal('');

  onBannerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.imageError.set('');

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.imageError.set('Please select a valid image file (PNG, JPG, or WebP).');
      input.value = '';
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      this.imageError.set('Image file size must be less than 2MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      try {
        const img = new Image();
        img.onload = () => {
          const maxWidth = 1280;
          const maxHeight = 720;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimized = canvas.toDataURL('image/jpeg', 0.85);
            this.bannerImageUrl.set(optimized);
          } else {
            this.bannerImageUrl.set(rawDataUrl);
          }
        };
        img.onerror = () => {
          this.bannerImageUrl.set(rawDataUrl);
        };
        img.src = rawDataUrl;
      } catch {
        this.bannerImageUrl.set(rawDataUrl);
      }
    };
    reader.onerror = () => {
      this.imageError.set('Failed to read image file. Please try again.');
    };
    reader.readAsDataURL(file);
  }

  removeBannerImage(): void {
    this.bannerImageUrl.set(null);
    this.imageError.set('');
  }

  // --- Step 1: Featured Speakers ---
  readonly speakers = signal<WizardSpeaker[]>([]);
  readonly speakerName = signal('');
  readonly speakerRole = signal('');
  readonly speakerCompany = signal('');
  readonly speakerTopic = signal('');
  readonly speakerError = signal('');

  addSpeaker(): void {
    const name = this.speakerName().trim();
    if (!name) {
      this.speakerError.set('Speaker name is required.');
      return;
    }

    this.speakers.update((list) => [
      ...list,
      {
        id: 'spk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name,
        role: this.speakerRole().trim() || undefined,
        company: this.speakerCompany().trim() || undefined,
        topic: this.speakerTopic().trim() || undefined,
      },
    ]);

    this.speakerName.set('');
    this.speakerRole.set('');
    this.speakerCompany.set('');
    this.speakerTopic.set('');
    this.speakerError.set('');
  }

  removeSpeaker(index: number): void {
    this.speakers.update((list) => list.filter((_, i) => i !== index));
  }

  readonly coOrganizerEmails = signal<string[]>([]);
  readonly coOrganizerMetadata = signal<
    Record<string, { fullName?: string; isRegistered: boolean }>
  >({});
  readonly coOrgInputText = signal('');
  readonly coOrgCandidates = signal<OrganizerCandidate[]>([]);
  readonly isSearchingCoOrg = signal(false);
  readonly showCoOrgDropdown = signal(false);
  private readonly coOrgSearch$ = new Subject<string>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const sub = this.coOrgSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.isSearchingCoOrg.set(false);
            return of([]);
          }
          this.isSearchingCoOrg.set(true);
          return this.organizerEvents.searchOrganizerCandidates(trimmed).pipe(
            catchError(() => of([])),
            finalize(() => this.isSearchingCoOrg.set(false)),
          );
        }),
      )
      .subscribe((candidates) => {
        this.coOrgCandidates.set(candidates);
        this.isSearchingCoOrg.set(false);
      });

    const staffSub = this.staffSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2) {
            this.isSearchingStaff.set(false);
            return of([]);
          }
          this.isSearchingStaff.set(true);
          return this.organizerEvents.searchOrganizerCandidates(trimmed).pipe(
            catchError(() => of([])),
            finalize(() => this.isSearchingStaff.set(false)),
          );
        }),
      )
      .subscribe((candidates) => {
        this.staffCandidates.set(candidates);
        this.isSearchingStaff.set(false);
      });

    destroyRef.onDestroy(() => {
      sub.unsubscribe();
      staffSub.unsubscribe();
    });
  }

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
  readonly boothError = signal('');

  // --- Step 4: Staff & Scanner Access ---
  readonly staffAssignments = signal<WizardStaffAssignment[]>([]);
  readonly staffEmail = signal('');
  readonly staffAccessLevel = signal<StaffAccessLevel>('ALL_SCANNERS');
  readonly staffCheckpointName = signal('');
  readonly staffError = signal('');
  readonly staffCandidates = signal<OrganizerCandidate[]>([]);
  readonly isSearchingStaff = signal(false);
  readonly showStaffDropdown = signal(false);
  private readonly staffSearch$ = new Subject<string>();

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
  isEmailFormat(text: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((text || '').trim());
  }

  onCoOrgInput(value: string): void {
    this.coOrgInputText.set(value);
    this.errorMessage.set('');
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      this.showCoOrgDropdown.set(true);
      this.coOrgSearch$.next(trimmed);
    } else {
      this.showCoOrgDropdown.set(false);
      this.coOrgCandidates.set([]);
    }
  }

  onCoOrgFocus(): void {
    if (this.coOrgInputText().trim().length >= 2) {
      this.showCoOrgDropdown.set(true);
    }
  }

  onCoOrgBlur(): void {
    setTimeout(() => {
      this.showCoOrgDropdown.set(false);
    }, 200);
  }

  selectCandidate(candidate: OrganizerCandidate): void {
    const email = candidate.email.trim().toLowerCase();
    if (this.coOrganizerEmails().includes(email)) {
      this.errorMessage.set(`'${email}' has already been added.`);
      this.showCoOrgDropdown.set(false);
      return;
    }
    this.coOrganizerEmails.update((list) => [...list, email]);
    this.coOrganizerMetadata.update((meta) => ({
      ...meta,
      [email]: { fullName: candidate.fullName, isRegistered: true },
    }));
    this.coOrgInputText.set('');
    this.coOrgCandidates.set([]);
    this.showCoOrgDropdown.set(false);
    this.errorMessage.set('');
  }

  addCoOrganizerEmail(input?: HTMLInputElement | string): void {
    const raw = typeof input === 'string' ? input : input?.value ?? this.coOrgInputText();
    const email = (raw || '').trim().toLowerCase();
    if (!email) return;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      this.errorMessage.set('Please enter a valid email address.');
      return;
    }
    if (this.coOrganizerEmails().includes(email)) {
      this.errorMessage.set('This organizer email has already been added.');
      return;
    }

    const matched = this.coOrgCandidates().find((c) => c.email.toLowerCase() === email);
    this.coOrganizerEmails.update((list) => [...list, email]);
    this.coOrganizerMetadata.update((meta) => ({
      ...meta,
      [email]: matched
        ? { fullName: matched.fullName, isRegistered: true }
        : { fullName: email.split('@')[0], isRegistered: false },
    }));

    this.coOrgInputText.set('');
    this.coOrgCandidates.set([]);
    this.showCoOrgDropdown.set(false);
    this.errorMessage.set('');
    if (input && typeof input !== 'string') {
      input.value = '';
    }
  }

  removeCoOrganizerEmail(index: number): void {
    const emailToRemove = this.coOrganizerEmails()[index];
    this.coOrganizerEmails.update((list) => list.filter((_, i) => i !== index));
    if (emailToRemove) {
      this.coOrganizerMetadata.update((meta) => {
        const copy = { ...meta };
        delete copy[emailToRemove];
        return copy;
      });
    }
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

    this.booths.update((list) => [
      ...list,
      {
        name,
        location: this.boothLocation().trim() || undefined,
        allowMultipleScans: this.boothAllowMultiScan(),
        requireMainEntry: this.boothRequireMainEntry(),
      },
    ]);

    this.boothName.set('');
    this.boothLocation.set('');
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
  onStaffEmailInput(value: string): void {
    this.staffEmail.set(value);
    this.staffError.set('');
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      this.showStaffDropdown.set(true);
      this.staffSearch$.next(trimmed);
    } else {
      this.showStaffDropdown.set(false);
      this.staffCandidates.set([]);
    }
  }

  onStaffFocus(): void {
    if (this.staffEmail().trim().length >= 2) {
      this.showStaffDropdown.set(true);
    }
  }

  onStaffBlur(): void {
    setTimeout(() => {
      this.showStaffDropdown.set(false);
    }, 200);
  }

  selectStaffCandidate(candidate: OrganizerCandidate): void {
    this.staffEmail.set(candidate.email.trim().toLowerCase());
    this.showStaffDropdown.set(false);
    this.staffCandidates.set([]);
    this.staffError.set('');
  }

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
    this.showStaffDropdown.set(false);
    this.staffCandidates.set([]);
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
      if (this.speakerName().trim()) {
        this.addSpeaker();
      }
      if (this.coOrgInputText().trim() && this.isEmailFormat(this.coOrgInputText())) {
        this.addCoOrganizerEmail();
      }
      if (!this.canProceedFromStep1()) return;
      this.currentStep.set(2);
    } else if (current === 2) {
      if (this.entranceName().trim()) {
        this.addEntrance();
      }
      this.currentStep.set(3);
    } else if (current === 3) {
      if (this.boothName().trim()) {
        this.addBooth();
      }
      this.currentStep.set(4);
    } else if (current === 4) {
      if (this.staffEmail().trim() && this.staffEmail().includes('@')) {
        this.addStaffAssignment();
      }
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
      banner_image_url: this.bannerImageUrl() || undefined,
      speakers: this.speakers().length > 0 ? this.speakers() : undefined,
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
