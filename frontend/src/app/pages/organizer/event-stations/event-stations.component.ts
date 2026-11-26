import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import { EventStaff } from '../../../core/organizer/organizer.models';
import { CheckpointType, StaffCheckpoint } from '../../../core/staff/scanner.models';
import { SubBoothApi } from '../../../core/staff/sub-booth-api';

interface StationSection {
  type: CheckpointType;
  title: string;
  hint: string;
  addLabel: string;
  stations: { station: StaffCheckpoint; children: StaffCheckpoint[] }[];
}

/** Which form is open, and where it is rendered. */
type StationForm =
  | { mode: 'create'; type: CheckpointType }
  | { mode: 'edit'; station: StaffCheckpoint }
  | { mode: 'sub'; parent: StaffCheckpoint };

const SECTIONS: Omit<StationSection, 'stations'>[] = [
  {
    type: 'MAIN_ENTRY',
    title: 'Entry gates',
    hint: 'Where attendees check in. Stations that require entry look for a scan here first.',
    addLabel: 'Add entry gate',
  },
  {
    type: 'SESSION',
    title: 'Sessions',
    hint: 'Talks, workshops or rooms that take attendance. Each one is a passport stamp.',
    addLabel: 'Add session',
  },
  {
    type: 'BOOTH',
    title: 'Booths',
    hint: 'Exhibitor or activity booths. Each booth and sub-booth is its own passport stamp.',
    addLabel: 'Add booth',
  },
  {
    type: 'EXIT',
    title: 'Exit gates',
    hint: 'Optional exit scans. They do not count toward the passport.',
    addLabel: 'Add exit gate',
  },
];

export const STATION_TYPE_LABELS: Record<CheckpointType, string> = {
  MAIN_ENTRY: 'Entry gate',
  SESSION: 'Session',
  BOOTH: 'Booth',
  EXIT: 'Exit gate',
};

@Component({
  imports: [DatePipe, NgTemplateOutlet],
  selector: 'app-event-stations',
  styleUrls: ['../event-stats/event-stats.component.scss', './event-stations.component.scss'],
  templateUrl: './event-stations.component.html',
})
export class EventStationsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly organizerEvents = inject(OrganizerEventsService);
  private readonly stationsApi = inject(SubBoothApi);

  readonly typeLabels = STATION_TYPE_LABELS;
  readonly typeOptions = SECTIONS.map((s) => ({ value: s.type, label: STATION_TYPE_LABELS[s.type] }));

  readonly eventId = signal('');
  readonly checkpoints = signal<StaffCheckpoint[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal('');

  // Form state
  readonly form = signal<StationForm | null>(null);
  readonly formName = signal('');
  readonly formLocation = signal('');
  readonly formType = signal<CheckpointType>('BOOTH');
  readonly formMultiScan = signal(false);
  readonly formRequireEntry = signal(false);
  readonly saving = signal(false);
  readonly formError = signal('');

  // Remove state
  readonly removingId = signal<string | null>(null);
  readonly isRemoving = signal(false);
  readonly removeError = signal('');

  // Staff
  readonly staffList = signal<EventStaff[]>([]);
  readonly staffLoading = signal(false);
  readonly staffError = signal('');
  readonly addingStaff = signal(false);

  /** Same rule as the event shell's Stations/Settings tabs; the API enforces it too. */
  readonly canManage = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'ORGANIZER') return true;
    const ev = this.organizerEvents.events().find((e) => e.id === this.eventId());
    return !!ev && (ev.organizer_id === user.id || !!ev.organizers?.some((o) => o.userId === user.id));
  });

  readonly sections = computed<StationSection[]>(() => {
    const list = this.checkpoints();
    const ids = new Set(list.map((c) => c.id));
    const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId));
    const byName = (a: StaffCheckpoint, b: StaffCheckpoint) => a.name.localeCompare(b.name);
    return SECTIONS.map((section) => ({
      ...section,
      stations: roots
        .filter((c) => c.type === section.type)
        .sort(byName)
        .map((station) => ({
          station,
          children: list.filter((c) => c.parentId === station.id).sort(byName),
        })),
    }));
  });

  readonly hasEntryGate = computed(() => this.checkpoints().some((c) => c.type === 'MAIN_ENTRY'));

  /** Stations that require an entry scan while the event has no entry gate. */
  readonly blockedByMissingGate = computed(() =>
    this.hasEntryGate() ? [] : this.checkpoints().filter((c) => c.requireMainEntry),
  );

  /** Title of the open form, for its heading. */
  readonly formTitle = computed(() => {
    const f = this.form();
    if (!f) return '';
    if (f.mode === 'create') return `New ${STATION_TYPE_LABELS[f.type].toLowerCase()}`;
    if (f.mode === 'sub') return `New sub-booth under ${f.parent.name}`;
    return `Edit ${f.station.name}`;
  });

  /** Type is set by the section on create; only editing a top-level station can move it. */
  readonly formTypeEditable = computed(() => {
    const f = this.form();
    return f?.mode === 'edit' && !f.station.parentId;
  });

  /** Sub-booths follow their parent's entry rule; entry gates never require entry. */
  readonly formShowsEntryRule = computed(() => {
    const f = this.form();
    if (!f || f.mode === 'sub' || (f.mode === 'edit' && f.station.parentId)) return false;
    return this.formType() !== 'MAIN_ENTRY';
  });

  ngOnInit(): void {
    this.route.parent?.paramMap.subscribe((params) => {
      const id = params.get('eventId') ?? '';
      if (!id) return;
      this.eventId.set(id);
      this.loadStations();
      this.loadStaff();
    });
  }

  loadStations(): void {
    const id = this.eventId();
    if (!id) return;
    this.stationsApi.listByEvent(id).subscribe({
      next: (list) => {
        this.checkpoints.set(list);
        this.loading.set(false);
        this.loadError.set('');
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.loadError.set(err.error?.message || 'Could not load stations.');
      },
    });
  }

  // ---- Forms ----

  isFormFor(key: string): boolean {
    const f = this.form();
    if (!f) return false;
    if (f.mode === 'create') return key === `section:${f.type}`;
    if (f.mode === 'sub') return key === `row:${f.parent.id}`;
    return key === `row:${f.station.id}`;
  }

  openCreate(type: CheckpointType): void {
    this.resetForm({ mode: 'create', type }, '', '', type, type === 'BOOTH', false);
  }

  openSub(parent: StaffCheckpoint): void {
    this.resetForm({ mode: 'sub', parent }, '', '', 'BOOTH', parent.allowMultipleScans, parent.requireMainEntry);
  }

  openEdit(station: StaffCheckpoint): void {
    this.resetForm(
      { mode: 'edit', station },
      station.name,
      station.location ?? '',
      station.type,
      station.allowMultipleScans,
      station.requireMainEntry,
    );
  }

  closeForm(): void {
    this.form.set(null);
    this.formError.set('');
  }

  private resetForm(
    form: StationForm,
    name: string,
    location: string,
    type: CheckpointType,
    multiScan: boolean,
    requireEntry: boolean,
  ): void {
    this.removingId.set(null);
    this.form.set(form);
    this.formName.set(name);
    this.formLocation.set(location);
    this.formType.set(type);
    this.formMultiScan.set(multiScan);
    this.formRequireEntry.set(requireEntry);
    this.formError.set('');
  }

  submitForm(event: Event): void {
    event.preventDefault();
    const f = this.form();
    if (!f || this.saving()) return;

    const name = this.formName().trim();
    if (!name) {
      this.formError.set('Please enter a name.');
      return;
    }
    const location = this.formLocation().trim();
    const type = this.formType();
    const requireMainEntry = type === 'MAIN_ENTRY' ? false : this.formRequireEntry();

    const request =
      f.mode === 'create'
        ? this.stationsApi.createCheckpoint({
            eventId: this.eventId(),
            name,
            type,
            location: location || undefined,
            allowMultipleScans: this.formMultiScan(),
            requireMainEntry,
          })
        : f.mode === 'sub'
          ? this.stationsApi.create(f.parent.id, {
              name,
              location: location || undefined,
              allowMultipleScans: this.formMultiScan(),
            })
          : this.stationsApi.update(f.station.id, {
              name,
              location,
              allowMultipleScans: this.formMultiScan(),
              ...(this.formTypeEditable() ? { type, requireMainEntry } : {}),
            });

    this.saving.set(true);
    this.formError.set('');
    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.closeForm();
        this.loadStations();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.formError.set(err.error?.message || 'Could not save this station.');
      },
    });
  }

  // ---- Remove ----

  canRemove(station: StaffCheckpoint): boolean {
    return station.type !== 'MAIN_ENTRY';
  }

  openRemove(id: string): void {
    this.closeForm();
    this.removingId.set(id);
    this.removeError.set('');
  }

  cancelRemove(): void {
    this.removingId.set(null);
    this.removeError.set('');
  }

  confirmRemove(): void {
    const id = this.removingId();
    if (!id || this.isRemoving()) return;
    this.isRemoving.set(true);
    this.stationsApi.remove(id).subscribe({
      next: () => {
        this.isRemoving.set(false);
        this.removingId.set(null);
        this.loadStations();
      },
      error: (err: { error?: { message?: string } }) => {
        this.isRemoving.set(false);
        this.removeError.set(err.error?.message || 'Could not remove this station.');
      },
    });
  }

  // ---- Staff ----

  loadStaff(): void {
    const id = this.eventId();
    if (!id) return;
    this.staffLoading.set(true);
    this.organizerEvents.loadStaff(id).subscribe({
      next: (list) => {
        this.staffList.set(list);
        this.staffLoading.set(false);
      },
      error: () => this.staffLoading.set(false),
    });
  }

  addStaffMember(email: string): void {
    const cleanEmail = email?.trim();
    const id = this.eventId();
    if (!cleanEmail || !id) return;
    this.addingStaff.set(true);
    this.staffError.set('');
    this.organizerEvents.addStaff(id, cleanEmail).subscribe({
      next: () => {
        this.addingStaff.set(false);
        this.loadStaff();
      },
      error: (err: { error?: { message?: string } }) => {
        this.addingStaff.set(false);
        this.staffError.set(err?.error?.message || 'Failed to add staff member.');
      },
    });
  }

  removeStaffMember(userId: string): void {
    const id = this.eventId();
    if (!userId || !id) return;
    this.organizerEvents.removeStaff(id, userId).subscribe({
      next: () => this.loadStaff(),
      error: () => undefined,
    });
  }
}
