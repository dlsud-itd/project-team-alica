import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import {
  EventScheduleItem,
  OrganizerEvent,
  OrganizerEventChanges,
  WizardSpeaker,
} from '../../../core/organizer/organizer.models';
import { StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';
import { CategoryTagSelectorComponent } from '../../../shared/category-tag-selector/category-tag-selector.component';
import { EventDetailsComponent } from '../../public/event-details/event-details.component';

/** Program item types. BOOTH and GATE are legacy (stations now live in the Stations tab). */
export const OVERVIEW_PROGRAM_TYPE_LABELS: Record<string, string> = {
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

function resolveDefaultBanner(category: string): string {
  const catLower = (category || '').toLowerCase();
  if (catLower.includes('expo') || catLower.includes('showcase')) {
    return 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200&auto=format&fit=crop&q=80';
  }
  if (catLower.includes('hackathon')) {
    return 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&auto=format&fit=crop&q=80';
  }
  if (catLower.includes('workshop')) {
    return 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&auto=format&fit=crop&q=80';
  }
  if (catLower.includes('tournament') || catLower.includes('sport') || catLower.includes('esport')) {
    return 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&auto=format&fit=crop&q=80';
  }
  if (catLower.includes('concert') || catLower.includes('cultural') || catLower.includes('music')) {
    return 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1200&auto=format&fit=crop&q=80';
  }
  return 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?w=1200&auto=format&fit=crop&q=80';
}

/**
 * Overview tab: organizers edit public event details, banner, schedule, and speakers
 * directly on the event page layout, or toggle into an unbadged attendee preview.
 * Non-organizer staff see the read-only attendee preview.
 */
@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EventDetailsComponent,
    CategoryTagSelectorComponent,
  ],
  selector: 'app-event-overview',
  styleUrl: './event-overview.component.scss',
  templateUrl: './event-overview.component.html',
})
export class EventOverviewComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  readonly auth = inject(AuthService);
  readonly organizerEvents = inject(OrganizerEventsService);
  private readonly stationsApi = inject(SubBoothApi);

  @ViewChild('scheduleDialog') private scheduleDialogRef?: ElementRef<HTMLDialogElement>;
  @ViewChild('speakerDialog') private speakerDialogRef?: ElementRef<HTMLDialogElement>;

  private routeSub?: Subscription;
  private pressedOutsideDialog: HTMLDialogElement | null = null;

  readonly eventId = signal('');
  readonly previewMode = signal(false);
  readonly stations = signal<StaffCheckpoint[]>([]);

  readonly programTypeLabels = OVERVIEW_PROGRAM_TYPE_LABELS;
  readonly programTypeOptions = signal<string[]>(PROGRAM_TYPES);

  readonly event = computed<OrganizerEvent | undefined>(() => {
    const id = this.eventId();
    return this.organizerEvents.events().find((e) => e.id === id);
  });

  readonly canEdit = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'ORGANIZER') return true;
    const ev = this.event();
    return !!ev && (ev.organizer_id === user.id || !!ev.organizers?.some((o) => o.userId === user.id));
  });

  // Display metadata matching the public EventDetailsComponent
  readonly categoryLabel = computed(() => {
    const ev = this.event();
    return ev?.category_label || ev?.category || 'Conference';
  });

  readonly organizerDisplayName = computed(() => {
    const ev = this.event();
    const primary = ev?.organizers?.find((o) => o.isPrimary)?.fullName;
    if (primary) return primary;
    const user = this.auth.user();
    if (user && ev?.organizer_id === user.id && user.fullName) {
      return user.fullName;
    }
    return 'Campus Organizer';
  });

  readonly dateLabel = computed(() => {
    const ev = this.event();
    if (!ev?.starts_at) return '';
    const start = new Date(ev.starts_at);
    if (isNaN(start.getTime())) return '';
    return start.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  });

  readonly scheduleDateLabel = computed(() => {
    const ev = this.event();
    if (!ev?.starts_at) return '';
    const start = new Date(ev.starts_at);
    if (isNaN(start.getTime())) return '';
    return start.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
    });
  });

  readonly timeLabel = computed(() => {
    const ev = this.event();
    if (!ev?.starts_at || !ev?.ends_at) return '';
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '';
    return `${start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })} - ${end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })}`;
  });

  readonly durationLabel = computed(() => {
    const ev = this.event();
    if (!ev?.starts_at || !ev?.ends_at) return '1 Day';
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '1 Day';
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return `${days} ${days === 1 ? 'Day' : 'Days'}`;
  });

  readonly checkpointMode = computed(() => {
    const count = this.stations().length || this.event()?.checkpoints_count || 0;
    return count > 1 ? 'Multi-stop Checks' : 'Single Gate Entry';
  });

  readonly spotsTotal = computed(() => this.event()?.capacity ?? 100);
  readonly spotsTaken = computed(() => this.event()?.registrations_count ?? 0);
  readonly spotsRemaining = computed(() => Math.max(0, this.spotsTotal() - this.spotsTaken()));
  readonly capacityPercent = computed(() => {
    const total = this.spotsTotal();
    if (total <= 0) return 0;
    return Math.min(100, (this.spotsTaken() / total) * 100);
  });

  readonly isLiveToday = computed(() => {
    const ev = this.event();
    if (!ev?.starts_at || !ev?.ends_at) return false;
    const now = Date.now();
    return now >= new Date(ev.starts_at).getTime() && now <= new Date(ev.ends_at).getTime();
  });

  readonly statusLabel = computed(() => {
    if (this.isLiveToday()) return 'Happening Today';
    const rem = this.spotsRemaining();
    if (rem <= 15 && rem > 0) return `${rem} Spots Left`;
    return 'Registration Open';
  });

  readonly defaultBannerUrl = computed(() => resolveDefaultBanner(this.categoryLabel()));
  readonly heroBannerUrl = computed(
    () => this.event()?.banner_image_url || this.defaultBannerUrl(),
  );
  readonly hasCustomBanner = computed(() => {
    const current = this.event()?.banner_image_url;
    return !!current && current !== this.defaultBannerUrl() && !current.includes('images.unsplash.com/');
  });

  readonly scheduleItems = computed<EventScheduleItem[]>(() => this.event()?.schedule ?? []);
  readonly speakers = computed<WizardSpeaker[]>(() => this.event()?.speakers ?? []);

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

  // Banner state
  readonly savingBanner = signal(false);
  readonly bannerError = signal('');
  readonly heroNotice = signal('');

  // Title inline edit state
  readonly editingTitle = signal(false);
  readonly savingTitle = signal(false);
  readonly titleError = signal('');
  readonly titleForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  // About inline edit state
  readonly editingAbout = signal(false);
  readonly savingAbout = signal(false);
  readonly aboutError = signal('');
  readonly aboutNotice = signal('');
  readonly aboutForm = new FormGroup({
    description: new FormControl('', { nonNullable: true }),
    category: new FormControl('Conference', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    tags: new FormControl<string[]>([], { nonNullable: true }),
  });

  // Sidebar key details inline edit state
  readonly editingDetails = signal(false);
  readonly savingDetails = signal(false);
  readonly detailsError = signal('');
  readonly detailsNotice = signal('');
  readonly detailsForm = new FormGroup({
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    require_student_id: new FormControl(false, { nonNullable: true }),
  });

  // Schedule modal state
  readonly scheduleModalOpen = signal(false);
  readonly editingScheduleIndex = signal<number | null>(null);
  readonly savingSchedule = signal(false);
  readonly scheduleError = signal('');
  readonly scheduleNotice = signal('');
  readonly scheduleItemForm = new FormGroup({
    time: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    type: new FormControl('SESSION', { nonNullable: true, validators: [Validators.required] }),
    location: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    checkpointId: new FormControl('', { nonNullable: true }),
  });

  // Speaker modal state
  readonly speakerModalOpen = signal(false);
  readonly editingSpeakerIndex = signal<number | null>(null);
  readonly savingSpeaker = signal(false);
  readonly speakerError = signal('');
  readonly speakerNotice = signal('');
  readonly speakerForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    role: new FormControl('', { nonNullable: true }),
    company: new FormControl('', { nonNullable: true }),
    topic: new FormControl('', { nonNullable: true }),
  });

  ngOnInit(): void {
    const parent = this.route.parent;
    if (parent) {
      this.routeSub = parent.paramMap.subscribe((params) => {
        const id = params.get('eventId') ?? '';
        this.initForEvent(id);
      });
    } else {
      const id = this.route.snapshot.paramMap.get('eventId') ?? '';
      this.initForEvent(id);
    }
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private initForEvent(id: string): void {
    this.eventId.set(id);
    this.resetEditors();
    if (!this.organizerEvents.eventsLoaded?.()) {
      this.organizerEvents.loadEvents?.().subscribe({ error: () => undefined });
    }
    if (id && this.stationsApi?.listByEvent) {
      this.stationsApi.listByEvent(id).subscribe({
        next: (list) => this.stations.set(list),
        error: () => undefined,
      });
    }
  }

  private resetEditors(): void {
    this.editingTitle.set(false);
    this.editingAbout.set(false);
    this.editingDetails.set(false);
    this.heroNotice.set('');
    this.bannerError.set('');
    this.titleError.set('');
    this.aboutNotice.set('');
    this.aboutError.set('');
    this.detailsNotice.set('');
    this.detailsError.set('');
    this.scheduleNotice.set('');
    this.scheduleError.set('');
    this.speakerNotice.set('');
    this.speakerError.set('');
  }

  togglePreview(): void {
    this.previewMode.update((v) => !v);
    if (this.previewMode()) {
      this.editingTitle.set(false);
      this.editingAbout.set(false);
      this.editingDetails.set(false);
    }
  }

  stationName(id: string | undefined): string | null {
    if (!id) return null;
    return this.stations().find((c) => c.id === id)?.name ?? null;
  }

  // ---- Banner Upload / Remove ----

  onBannerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    this.bannerError.set('');
    this.heroNotice.set('');

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.bannerError.set('Please select a valid image file (PNG, JPG, or WebP).');
      input.value = '';
      return;
    }

    const maxSize = 2 * 1024 * 1024; // 2MB
    if (file.size > maxSize) {
      this.bannerError.set('Image file size must be less than 2MB.');
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
          let finalUrl = rawDataUrl;
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            finalUrl = canvas.toDataURL('image/jpeg', 0.85);
          }
          this.persistBanner(finalUrl);
        };
        img.onerror = () => this.persistBanner(rawDataUrl);
        img.src = rawDataUrl;
      } catch {
        this.persistBanner(rawDataUrl);
      }
      input.value = '';
    };
    reader.onerror = () => {
      this.bannerError.set('Failed to read image file. Please try again.');
      input.value = '';
    };
    reader.readAsDataURL(file);
  }

  removeBanner(): void {
    this.bannerError.set('');
    this.heroNotice.set('');
    this.persistBanner(null);
  }

  private persistBanner(url: string | null): void {
    const ev = this.event();
    if (!ev || this.savingBanner()) return;

    this.savingBanner.set(true);
    this.organizerEvents.updateEvent(ev.id, { banner_image_url: url }).subscribe({
      next: () => {
        this.savingBanner.set(false);
        this.heroNotice.set(url ? 'Cover image updated.' : 'Cover image reset to default.');
      },
      error: (err: { error?: { message?: string } }) => {
        this.savingBanner.set(false);
        this.bannerError.set(err.error?.message || 'Could not update cover image.');
      },
    });
  }

  // ---- Hero Title ----

  startEditTitle(): void {
    const ev = this.event();
    if (!ev) return;
    this.titleError.set('');
    this.heroNotice.set('');
    this.titleForm.reset({ name: ev.name });
    this.editingTitle.set(true);
  }

  cancelEditTitle(): void {
    this.editingTitle.set(false);
    this.titleError.set('');
  }

  saveTitle(): void {
    const ev = this.event();
    if (!ev || this.savingTitle()) return;
    const cleanName = this.titleForm.controls.name.value.trim();
    if (!cleanName) {
      this.titleError.set('Event title is required.');
      return;
    }

    this.savingTitle.set(true);
    this.titleError.set('');
    this.persistPatch(
      { name: cleanName },
      () => {
        this.savingTitle.set(false);
        this.editingTitle.set(false);
        this.heroNotice.set('Event title updated.');
      },
      (msg) => {
        this.savingTitle.set(false);
        this.titleError.set(msg);
      },
      'Could not update event title.',
    );
  }

  // ---- About Event (Description, Category & Tags) ----

  startEditAbout(): void {
    const ev = this.event();
    if (!ev) return;
    this.aboutError.set('');
    this.aboutNotice.set('');
    this.aboutForm.reset({
      description: ev.description ?? '',
      category: ev.category ?? 'Conference',
      tags: ev.tags ? [...ev.tags] : [],
    });
    this.editingAbout.set(true);
  }

  cancelEditAbout(): void {
    this.editingAbout.set(false);
    this.aboutError.set('');
  }

  saveAbout(): void {
    const ev = this.event();
    if (!ev || this.savingAbout()) return;
    if (this.aboutForm.invalid) {
      this.aboutError.set('Please select a primary category.');
      return;
    }

    const raw = this.aboutForm.getRawValue();
    this.savingAbout.set(true);
    this.aboutError.set('');
    this.persistPatch(
      {
        description: raw.description.trim(),
        category: raw.category,
        tags: raw.tags,
      },
      () => {
        this.savingAbout.set(false);
        this.editingAbout.set(false);
        this.aboutNotice.set('About section updated.');
      },
      (msg) => {
        this.savingAbout.set(false);
        this.aboutError.set(msg);
      },
      'Could not save event overview details.',
    );
  }

  // ---- Key Details Sidebar (Venue, Dates, Capacity, Require Student ID) ----

  startEditDetails(): void {
    const ev = this.event();
    if (!ev) return;
    this.detailsError.set('');
    this.detailsNotice.set('');
    this.detailsForm.reset({
      venue: ev.venue,
      starts_at: toDateTimeLocalInput(ev.starts_at),
      ends_at: toDateTimeLocalInput(ev.ends_at),
      capacity: ev.capacity,
      require_student_id: ev.require_student_id ?? false,
    });
    this.editingDetails.set(true);
  }

  cancelEditDetails(): void {
    this.editingDetails.set(false);
    this.detailsError.set('');
  }

  saveDetails(): void {
    const ev = this.event();
    if (!ev || this.savingDetails()) return;
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      this.detailsError.set('Please fill out venue, schedule dates, and capacity properly.');
      return;
    }

    const raw = this.detailsForm.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      this.detailsError.set('Please provide valid start and end dates.');
      return;
    }
    if (endDate <= startDate) {
      this.detailsError.set('End date & time must be after the start date & time.');
      return;
    }

    const capacity = Number(raw.capacity);
    if (capacity < ev.registrations_count) {
      this.detailsError.set(
        `Capacity cannot be lower than current registrations (${ev.registrations_count}).`,
      );
      return;
    }

    this.savingDetails.set(true);
    this.detailsError.set('');
    this.persistPatch(
      {
        venue: raw.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity,
        require_student_id: raw.require_student_id,
      },
      () => {
        this.savingDetails.set(false);
        this.editingDetails.set(false);
        this.detailsNotice.set('Event details updated.');
      },
      (msg) => {
        this.savingDetails.set(false);
        this.detailsError.set(msg);
      },
      'Could not update event details.',
    );
  }

  // ---- Program Schedule Modal & Immediate Save ----

  openAddScheduleModal(): void {
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
    this.scheduleNotice.set('');
    this.scheduleModalOpen.set(true);
    this.openNativeDialog(this.scheduleDialogRef);
  }

  openEditScheduleModal(index: number): void {
    const items = this.scheduleItems();
    if (index < 0 || index >= items.length) return;
    const item = items[index];
    this.editingScheduleIndex.set(index);
    this.scheduleItemForm.reset({
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
    this.scheduleNotice.set('');
    this.scheduleModalOpen.set(true);
    this.openNativeDialog(this.scheduleDialogRef);
  }

  closeScheduleModal(): void {
    this.scheduleModalOpen.set(false);
    this.editingScheduleIndex.set(null);
    this.scheduleError.set('');
    this.closeNativeDialog(this.scheduleDialogRef);
  }

  onScheduleDialogClosed(): void {
    this.scheduleModalOpen.set(false);
    this.editingScheduleIndex.set(null);
    this.scheduleError.set('');
  }

  saveScheduleItem(): void {
    const ev = this.event();
    if (!ev || this.savingSchedule()) return;
    if (this.scheduleItemForm.invalid) {
      this.scheduleItemForm.markAllAsTouched();
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

    this.savingSchedule.set(true);
    this.scheduleError.set('');
    this.persistPatch(
      { schedule: updated },
      () => {
        this.savingSchedule.set(false);
        this.closeScheduleModal();
        this.scheduleNotice.set(
          editIdx !== null ? 'Program item updated.' : 'Program item added.',
        );
      },
      (msg) => {
        this.savingSchedule.set(false);
        this.scheduleError.set(msg);
      },
      'Could not save program schedule.',
    );
  }

  removeScheduleItem(index: number): void {
    const ev = this.event();
    if (!ev || this.savingSchedule()) return;
    const updated = this.scheduleItems().filter((_, i) => i !== index);
    this.savingSchedule.set(true);
    this.scheduleError.set('');
    this.scheduleNotice.set('');
    this.persistPatch(
      { schedule: updated },
      () => {
        this.savingSchedule.set(false);
        this.scheduleNotice.set('Program item removed.');
      },
      (msg) => {
        this.savingSchedule.set(false);
        this.scheduleError.set(msg);
      },
      'Could not remove program item.',
    );
  }

  // ---- Featured Speakers Modal & Immediate Save ----

  openAddSpeakerModal(): void {
    this.editingSpeakerIndex.set(null);
    this.speakerForm.reset({
      name: '',
      role: '',
      company: '',
      topic: '',
    });
    this.speakerError.set('');
    this.speakerNotice.set('');
    this.speakerModalOpen.set(true);
    this.openNativeDialog(this.speakerDialogRef);
  }

  openEditSpeakerModal(index: number): void {
    const list = this.speakers();
    if (index < 0 || index >= list.length) return;
    const spk = list[index];
    this.editingSpeakerIndex.set(index);
    this.speakerForm.reset({
      name: spk.name,
      role: spk.role ?? '',
      company: spk.company ?? '',
      topic: spk.topic ?? '',
    });
    this.speakerError.set('');
    this.speakerNotice.set('');
    this.speakerModalOpen.set(true);
    this.openNativeDialog(this.speakerDialogRef);
  }

  closeSpeakerModal(): void {
    this.speakerModalOpen.set(false);
    this.editingSpeakerIndex.set(null);
    this.speakerError.set('');
    this.closeNativeDialog(this.speakerDialogRef);
  }

  onSpeakerDialogClosed(): void {
    this.speakerModalOpen.set(false);
    this.editingSpeakerIndex.set(null);
    this.speakerError.set('');
  }

  saveSpeakerItem(): void {
    const ev = this.event();
    if (!ev || this.savingSpeaker()) return;
    const val = this.speakerForm.getRawValue();
    if (!val.name.trim()) {
      this.speakerForm.markAllAsTouched();
      this.speakerError.set('Speaker name is required.');
      return;
    }

    const editIdx = this.editingSpeakerIndex();
    const existing = editIdx !== null && editIdx >= 0 ? this.speakers()[editIdx] : undefined;
    const newSpeaker: WizardSpeaker = {
      id: existing?.id || `spk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: val.name.trim(),
      role: val.role.trim() || undefined,
      company: val.company.trim() || undefined,
      topic: val.topic.trim() || undefined,
      ...(existing?.avatarUrl ? { avatarUrl: existing.avatarUrl } : {}),
    };

    const updated = [...this.speakers()];
    if (editIdx !== null && editIdx >= 0) {
      updated[editIdx] = newSpeaker;
    } else {
      updated.push(newSpeaker);
    }

    this.savingSpeaker.set(true);
    this.speakerError.set('');
    this.persistPatch(
      { speakers: updated },
      () => {
        this.savingSpeaker.set(false);
        this.closeSpeakerModal();
        this.speakerNotice.set(editIdx !== null ? 'Speaker updated.' : 'Speaker added.');
      },
      (msg) => {
        this.savingSpeaker.set(false);
        this.speakerError.set(msg);
      },
      'Could not save speakers.',
    );
  }

  removeSpeakerItem(index: number): void {
    const ev = this.event();
    if (!ev || this.savingSpeaker()) return;
    const updated = this.speakers().filter((_, i) => i !== index);
    this.savingSpeaker.set(true);
    this.speakerError.set('');
    this.speakerNotice.set('');
    this.persistPatch(
      { speakers: updated },
      () => {
        this.savingSpeaker.set(false);
        this.speakerNotice.set('Speaker removed.');
      },
      (msg) => {
        this.savingSpeaker.set(false);
        this.speakerError.set(msg);
      },
      'Could not remove speaker.',
    );
  }

  // ---- Shared Persistence & Dialog Helpers ----

  private persistPatch(
    changes: OrganizerEventChanges,
    onSuccess: (saved: OrganizerEvent) => void,
    onError: (msg: string) => void,
    fallbackMsg: string,
  ): void {
    const ev = this.event();
    if (!ev) return;
    this.organizerEvents.updateEvent(ev.id, changes).subscribe({
      next: (saved) => onSuccess(saved),
      error: (err: { error?: { message?: string } }) => {
        onError(err.error?.message || fallbackMsg);
      },
    });
  }

  private openNativeDialog(ref?: ElementRef<HTMLDialogElement>): void {
    const el = ref?.nativeElement;
    if (!el) return;
    if (typeof el.showModal === 'function') {
      if (!el.open) el.showModal();
    } else {
      el.setAttribute('open', '');
    }
  }

  private closeNativeDialog(ref?: ElementRef<HTMLDialogElement>): void {
    const el = ref?.nativeElement;
    if (!el) return;
    if (typeof el.close === 'function') {
      if (el.open) el.close();
    } else {
      el.removeAttribute('open');
    }
  }

  onDialogPointerDown(event: PointerEvent, dialog: HTMLDialogElement): void {
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) return;
    this.pressedOutsideDialog = this.isOutsideDialog(event, dialog) ? dialog : null;
  }

  onDialogPointerUp(event: PointerEvent, dialog: HTMLDialogElement): void {
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) return;
    if (this.pressedOutsideDialog === dialog && this.isOutsideDialog(event, dialog)) {
      this.pressedOutsideDialog = null;
      if (dialog === this.scheduleDialogRef?.nativeElement) {
        this.closeScheduleModal();
      } else if (dialog === this.speakerDialogRef?.nativeElement) {
        this.closeSpeakerModal();
      }
      return;
    }
    this.pressedOutsideDialog = null;
  }

  private isOutsideDialog(event: PointerEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  }
}
