import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventOrganizer, EventScheduleItem, OrganizerEvent } from '../../../core/organizer/organizer.models';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';
import { CategoryTagSelectorComponent } from '../../../shared/category-tag-selector/category-tag-selector.component';

/** Program item types. BOOTH and GATE are legacy (stations now live in the Stations tab). */
export const PROGRAM_TYPE_LABELS: Record<string, string> = {
  KEYNOTE: 'Keynote',
  SESSION: 'Session / Talk',
  WORKSHOP: 'Workshop',
  PANEL: 'Panel discussion',
  BREAK: 'Break / Meal',
  OTHER: 'Other',
  BOOTH: 'Booth activity (legacy)',
  GATE: 'Gate / Check-in (legacy)',
};
const PROGRAM_TYPES = ['KEYNOTE', 'SESSION', 'WORKSHOP', 'PANEL', 'BREAK', 'OTHER'];

function toDateTimeLocalInput(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

@Component({
  imports: [DatePipe, ReactiveFormsModule, CategoryTagSelectorComponent],
  selector: 'app-event-settings',
  styleUrl: './event_settings.component.scss',
  templateUrl: './event_settings.component.html',
})
export class EventSettingsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly organizerEvents = inject(OrganizerEventsService);
  private readonly stationsApi = inject(SubBoothApi);
  readonly auth = inject(AuthService);

  readonly eventId = signal('');
  readonly isSavingGeneral = signal(false);
  readonly generalSuccess = signal('');
  readonly generalError = signal('');

  // Banner image state
  readonly bannerImageUrl = signal<string | null>(null);
  readonly imageError = signal('');

  // Schedule state
  readonly scheduleItems = signal<EventScheduleItem[]>([]);
  /** Stations an item may optionally link to (where its attendance is scanned). */
  readonly stations = signal<StaffCheckpoint[]>([]);
  readonly programTypeLabels = PROGRAM_TYPE_LABELS;
  /** Type options for the open form; a legacy type stays selectable on items that already use it. */
  readonly programTypeOptions = signal<string[]>(PROGRAM_TYPES);
  readonly stationOptions = computed(() => {
    const list = this.stations();
    const ids = new Set(list.map((c) => c.id));
    const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId));
    return roots.flatMap((root) => [
      { id: root.id, label: root.name },
      ...list
        .filter((c) => c.parentId === root.id)
        .map((c) => ({ id: c.id, label: '↳ ' + c.name })),
    ]);
  });
  readonly scheduleFormOpen = signal(false);
  readonly editingScheduleIndex = signal<number | null>(null);
  readonly scheduleError = signal('');

  // Activity Booths management (replaces Program Schedule section)
  readonly booths = computed(() =>
    this.stations().filter((s) => s.type === 'BOOTH'),
  );
  readonly showAddBoothForm = signal(false);
  readonly isAddingBooth = signal(false);
  readonly boothName = signal('');
  readonly boothLocation = signal('');
  readonly boothRequireMainEntry = signal(false);
  readonly boothAllowMultiScan = signal(true);
  readonly boothError = signal('');
  readonly boothSuccess = signal('');

  // Organizers state
  readonly organizers = signal<EventOrganizer[]>([]);
  readonly organizersLoading = signal(false);
  readonly addingOrganizer = signal(false);
  readonly organizerError = signal('');
  readonly organizerSuccess = signal('');

  // Delete state
  readonly deleting = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  private routeSub?: Subscription;

  readonly events = this.organizerEvents.events;
  readonly event = computed<OrganizerEvent | undefined>(() => {
    const id = this.eventId();
    return this.events().find((e) => e.id === id);
  });

  readonly isOwner = computed(() => {
    const user = this.auth.user();
    const ev = this.event();
    if (!user || !ev) return false;
    return user.role === 'ADMIN' || ev.organizer_id === user.id;
  });

  readonly primaryOrganizer = computed(() =>
    this.organizers().find((o) => o.isPrimary),
  );

  readonly coOrganizers = computed(() =>
    this.organizers().filter((o) => !o.isPrimary),
  );

  readonly generalForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('Conference', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    tags: new FormControl<string[]>([], { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
    is_private: new FormControl(false, { nonNullable: true }),
  });

  readonly scheduleItemForm = new FormGroup({
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl('SESSION', { nonNullable: true, validators: [Validators.required] }),
    location: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    checkpointId: new FormControl('', { nonNullable: true }),
  });

  stationName(id: string | undefined): string | null {
    if (!id) return null;
    return this.stations().find((c) => c.id === id)?.name ?? null;
  }

  private loadStations(eventId: string): void {
    this.stationsApi.listByEvent(eventId).subscribe({
      next: (list) => this.stations.set(list),
      error: () => undefined,
    });
  }

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      this.routeSub = parent.paramMap.subscribe((params) => {
        const id = params.get('eventId') ?? '';
        if (id) {
          this.eventId.set(id);
          this.syncEventData();
          this.loadOrganizers(id);
          this.loadStations(id);
        }
      });
    } else {
      const id = this.route.snapshot.paramMap.get('eventId') ?? '';
      if (id) {
        this.eventId.set(id);
        this.syncEventData();
        this.loadOrganizers(id);
        this.loadStations(id);
      }
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  syncEventData(): void {
    if (!this.organizerEvents.eventsLoaded()) {
      this.organizerEvents.loadEvents().subscribe({
        next: () => this.populateForm(),
        error: () => undefined,
      });
    } else {
      this.populateForm();
    }
  }

  private populateForm(): void {
    const ev = this.event();
    if (!ev) return;
    this.generalForm.patchValue({
      name: ev.name,
      category: ev.category ?? 'Conference',
      tags: ev.tags ?? [],
      description: ev.description,
      venue: ev.venue,
      starts_at: toDateTimeLocalInput(ev.starts_at),
      ends_at: toDateTimeLocalInput(ev.ends_at),
      capacity: ev.capacity,
      allow_walk_ins: ev.allow_walk_ins,
      is_private: ev.is_private ?? false,
    });
    this.bannerImageUrl.set(ev.banner_image_url ?? null);
    this.scheduleItems.set(ev.schedule ? [...ev.schedule] : []);
  }

  // Cover image management
  onImageSelected(event: Event): void {
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

  removeImage(): void {
    this.bannerImageUrl.set(null);
    this.imageError.set('');
  }

  // Schedule timeline management
  openAddScheduleItem(): void {
    this.editingScheduleIndex.set(null);
    this.scheduleItemForm.reset({
      time: '',
      title: '',
      type: 'SESSION',
      location: '',
      description: '',
      checkpointId: '',
    });
    this.programTypeOptions.set(PROGRAM_TYPES);
    this.scheduleError.set('');
    this.scheduleFormOpen.set(true);
  }

  openEditScheduleItem(index: number): void {
    const items = this.scheduleItems();
    if (index < 0 || index >= items.length) return;
    const item = items[index];
    this.editingScheduleIndex.set(index);
    this.scheduleItemForm.patchValue({
      time: item.time,
      title: item.title,
      type: item.type,
      location: item.location ?? '',
      description: item.description ?? '',
      checkpointId: item.checkpointId ?? '',
    });
    this.programTypeOptions.set(
      PROGRAM_TYPES.includes(item.type) ? PROGRAM_TYPES : [...PROGRAM_TYPES, item.type],
    );
    this.scheduleError.set('');
    this.scheduleFormOpen.set(true);
  }

  closeScheduleForm(): void {
    this.scheduleFormOpen.set(false);
    this.editingScheduleIndex.set(null);
    this.scheduleError.set('');
  }

  saveScheduleItem(): void {
    if (this.scheduleItemForm.invalid) {
      this.scheduleError.set('Please fill in both Time and Title for this program item.');
      return;
    }
    const val = this.scheduleItemForm.getRawValue();
    const editIdx = this.editingScheduleIndex();
    const newItem: EventScheduleItem = {
      id:
        editIdx !== null && editIdx >= 0
          ? this.scheduleItems()[editIdx].id
          : `sch-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: val.time.trim(),
      title: val.title.trim(),
      type: val.type,
      location: val.location.trim() || undefined,
      description: val.description.trim(),
      ...(val.checkpointId ? { checkpointId: val.checkpointId } : {}),
    };

    const updated = [...this.scheduleItems()];
    if (editIdx !== null && editIdx >= 0) {
      updated[editIdx] = newItem;
    } else {
      updated.push(newItem);
    }
    this.scheduleItems.set(updated);
    this.closeScheduleForm();
  }

  removeScheduleItem(index: number): void {
    const updated = this.scheduleItems().filter((_, i) => i !== index);
    this.scheduleItems.set(updated);
  }

  // Activity Booths management
  openAddBooth(): void {
    this.boothName.set('');
    this.boothLocation.set('');
    this.boothRequireMainEntry.set(false);
    this.boothAllowMultiScan.set(true);
    this.boothError.set('');
    this.showAddBoothForm.set(true);
  }

  closeAddBooth(): void {
    this.showAddBoothForm.set(false);
    this.boothError.set('');
  }

  saveBooth(): void {
    const name = this.boothName().trim();
    const eventId = this.eventId();
    if (!name) {
      this.boothError.set('Booth name is required.');
      return;
    }
    if (!eventId) return;

    this.isAddingBooth.set(true);
    this.boothError.set('');
    this.boothSuccess.set('');

    this.stationsApi
      .createCheckpoint({
        eventId,
        name,
        location: this.boothLocation().trim() || undefined,
        type: 'BOOTH',
        allowMultipleScans: this.boothAllowMultiScan(),
        requireMainEntry: this.boothRequireMainEntry(),
      })
      .subscribe({
        next: (created) => {
          this.isAddingBooth.set(false);
          this.closeAddBooth();
          this.boothSuccess.set(`Booth "${created.name}" created successfully.`);
          this.loadStations(eventId);
        },
        error: (err: { error?: { message?: string } }) => {
          this.isAddingBooth.set(false);
          this.boothError.set(err.error?.message ?? 'Could not create booth.');
        },
      });
  }

  removeBooth(boothId: string): void {
    const eventId = this.eventId();
    if (!boothId || !eventId) return;

    this.boothError.set('');
    this.boothSuccess.set('');

    this.stationsApi.remove(boothId).subscribe({
      next: () => {
        this.boothSuccess.set('Booth removed successfully.');
        this.loadStations(eventId);
      },
      error: (err: { error?: { message?: string } }) => {
        this.boothError.set(err.error?.message ?? 'Could not remove booth.');
      },
    });
  }

  loadOrganizers(eventId: string): void {
    this.organizersLoading.set(true);
    this.organizerEvents.loadOrganizers(eventId).subscribe({
      next: (list) => {
        this.organizers.set(list);
        this.organizersLoading.set(false);
      },
      error: () => {
        this.organizersLoading.set(false);
      },
    });
  }

  saveGeneralSettings(): void {
    const ev = this.event();
    if (!ev) return;

    if (this.generalForm.invalid) {
      this.generalError.set('Please fill out all required fields properly.');
      return;
    }

    const raw = this.generalForm.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      this.generalError.set('Please provide valid start and end dates.');
      return;
    }
    if (endDate <= startDate) {
      this.generalError.set('End date & time must be after the start date & time.');
      return;
    }

    const capacity = Number(raw.capacity);
    if (capacity < ev.registrations_count) {
      this.generalError.set(
        `Capacity cannot be lower than current registrations (${ev.registrations_count}).`,
      );
      return;
    }

    this.isSavingGeneral.set(true);
    this.generalError.set('');
    this.generalSuccess.set('');

    this.organizerEvents
      .updateEvent(ev.id, {
        name: raw.name.trim(),
        description: raw.description.trim(),
        venue: raw.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity,
        allow_walk_ins: raw.allow_walk_ins,
        is_private: raw.is_private,
        category: raw.category,
        tags: raw.tags,
        banner_image_url: this.bannerImageUrl(),
        schedule: this.scheduleItems(),
      })
      .subscribe({
        next: (saved) => {
          this.isSavingGeneral.set(false);
          this.generalSuccess.set(`Event settings for "${saved.name}" have been updated.`);
        },
        error: (err: { error?: { message?: string } }) => {
          this.isSavingGeneral.set(false);
          this.generalError.set(err.error?.message ?? 'Could not save event settings.');
        },
      });
  }

  addOrganizerMember(emailInput: HTMLInputElement): void {
    const cleanEmail = emailInput.value.trim().toLowerCase();
    const id = this.eventId();
    if (!cleanEmail || !id) return;

    this.addingOrganizer.set(true);
    this.organizerError.set('');
    this.organizerSuccess.set('');

    this.organizerEvents.addOrganizer(id, cleanEmail).subscribe({
      next: (added) => {
        this.addingOrganizer.set(false);
        emailInput.value = '';
        this.organizerSuccess.set(`Added ${added.fullName} (${added.email}) as co-organizer.`);
        this.loadOrganizers(id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.addingOrganizer.set(false);
        this.organizerError.set(
          err.error?.message ?? 'Failed to add co-organizer. Ensure the user is registered.',
        );
      },
    });
  }

  removeOrganizerMember(userId: string): void {
    const id = this.eventId();
    if (!userId || !id) return;

    this.organizerError.set('');
    this.organizerSuccess.set('');

    this.organizerEvents.removeOrganizer(id, userId).subscribe({
      next: () => {
        this.organizerSuccess.set('Co-organizer removed successfully.');
        this.loadOrganizers(id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.organizerError.set(err.error?.message ?? 'Could not remove co-organizer.');
      },
    });
  }

  openDelete(): void {
    this.deleting.set(true);
  }

  closeDelete(): void {
    this.deleting.set(false);
    this.deleteError.set('');
  }

    confirmDelete(): void {
    const ev = this.event();
    if (!ev || this.isDeleting()) return;

    this.isDeleting.set(true);
    this.deleteError.set('');
    this.organizerEvents.deleteEvent(ev.id).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.closeDelete();
        this.router.navigate(['/hub']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.isDeleting.set(false);
        this.deleteError.set(err.error?.message ?? 'Could not delete the event. Please try again.');
      },
    });
  }
}

