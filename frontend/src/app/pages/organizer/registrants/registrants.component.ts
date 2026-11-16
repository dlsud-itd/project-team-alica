import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { filter, map, switchMap } from 'rxjs';
import * as QRCode from 'qrcode';
import {
  EventRegistrant,
  GuestFilePreview,
  GuestImportMapping,
  RegistrationStatus,
} from '../../../core/organizer/organizer.models';
import {
  GuestImportResult,
  OrganizerEventsService,
} from '../../../core/organizer/organizer-events.service';
import { AuthService } from '../../../core/auth/auth.service';

export type RegistrantFilter = 'ALL' | 'Registered' | 'Checked In' | 'Cancelled';

@Component({
  imports: [DatePipe, FormsModule, ReactiveFormsModule],
  selector: 'app-organizer-registrants',
  styleUrl: './registrants.component.scss',
  templateUrl: './registrants.component.html',
})
export class OrganizerRegistrants {
  private readonly route = inject(ActivatedRoute);
  private readonly organizerEvents = inject(OrganizerEventsService);
  private readonly auth = inject(AuthService);

  readonly eventId = toSignal(
    (this.route.parent?.paramMap ?? this.route.paramMap).pipe(
      map((params) => params.get('eventId') ?? ''),
    ),
    { initialValue: '' },
  );
  readonly eventsLoaded = this.organizerEvents.eventsLoaded;
  readonly isOrganizer = computed(() => {
    const user = this.auth.user();
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'ORGANIZER') return true;
    const ev = this.event();
    return !!ev && ev.organizer_id === user.id;
  });
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly actionLoading = signal(false);
  readonly importLoading = signal(false);
  readonly previewLoading = signal(false);
  readonly includeCredentials = signal(false);
  readonly importResult = signal<GuestImportResult | null>(null);

  // Status Filter
  readonly statusFilter = signal<RegistrantFilter>('ALL');

  // Modal States
  readonly selectedRegistrant = signal<EventRegistrant | null>(null);
  readonly activeQrRegistrant = signal<EventRegistrant | null>(null);
  readonly qrDataUrl = signal<string>('');
  readonly qrLoading = signal<boolean>(false);
  readonly cancellingRegistrant = signal<EventRegistrant | null>(null);
  readonly restoringRegistrant = signal<EventRegistrant | null>(null);

  // Column Mapping Modal States
  readonly mappingModalOpen = signal(false);
  readonly summaryModalOpen = signal(false);
  readonly pendingFile = signal<File | null>(null);
  readonly detectedHeaders = signal<string[]>([]);
  readonly sampleRows = signal<string[][]>([]);
  readonly totalFileRows = signal<number>(0);
  readonly hasHeaders = signal(true);
  readonly nameMode = signal<'single' | 'split'>('single');
  readonly selectedFullNameCol = signal('');
  readonly selectedFirstNameCol = signal('');
  readonly selectedLastNameCol = signal('');
  readonly selectedEmailCol = signal('');
  readonly selectedStudentIdCol = signal('');
  readonly selectedContactCol = signal('');
  readonly selectedAffiliationCol = signal('');
  readonly credentialsCopied = signal(false);

  constructor() {
    if (!this.organizerEvents.eventsLoaded()) {
      this.reloadEvents();
    }

    const idSource$ = this.route.parent?.paramMap ?? this.route.paramMap;
    idSource$
      .pipe(
        map((params) => params.get('eventId') ?? ''),
        filter(Boolean),
        switchMap((eventId) => this.organizerEvents.loadRegistrants(eventId)),
        takeUntilDestroyed(),
      )
      .subscribe({
        error: () => this.errorMessage.set('Could not load registrants. Please try again later.'),
      });
  }

  readonly event = computed(() => this.organizerEvents.eventById(this.eventId()));
  readonly loading = this.organizerEvents.loading;
  readonly loadError = this.organizerEvents.error;
  readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  readonly allEventAttendees = computed(() =>
    this.organizerEvents
      .registrants()
      .filter((registrant) => registrant.event_id === this.eventId()),
  );

  readonly registeredCount = computed(
    () =>
      this.allEventAttendees().filter((registrant) => registrant.status === 'Registered').length,
  );
  readonly checkedInCount = computed(
    () =>
      this.allEventAttendees().filter((registrant) => registrant.status === 'Checked In').length,
  );
  readonly cancelledCount = computed(
    () => this.allEventAttendees().filter((registrant) => registrant.status === 'Cancelled').length,
  );

  readonly attendees = computed(() => {
    const filterVal = this.statusFilter();
    const query = this.searchText().trim().toLocaleLowerCase();

    return this.allEventAttendees()
      .filter((registrant) => {
        if (filterVal === 'ALL') return true;
        return registrant.status === filterVal;
      })
      .filter((registrant) => {
        if (!query) return true;
        const nameMatch = registrant.full_name.toLocaleLowerCase().includes(query);
        const emailMatch = registrant.email.toLocaleLowerCase().includes(query);
        const ticketMatch = registrant.ticket_id.toLocaleLowerCase().includes(query);
        return nameMatch || emailMatch || ticketMatch;
      });
  });

  readonly isMappingValid = computed(() => {
    if (!this.selectedEmailCol()) return false;
    if (this.nameMode() === 'single') {
      return !!this.selectedFullNameCol();
    }
    return !!this.selectedFirstNameCol() && !!this.selectedLastNameCol();
  });

  readonly previewRows = computed(() => {
    const raw = this.sampleRows();
    const headers = this.detectedHeaders();
    if (!raw.length || !headers.length) return [];

    const getIdx = (colName: string) => headers.indexOf(colName);
    const fullIdx = getIdx(this.selectedFullNameCol());
    const firstIdx = getIdx(this.selectedFirstNameCol());
    const lastIdx = getIdx(this.selectedLastNameCol());
    const emailIdx = getIdx(this.selectedEmailCol());
    const studentIdx = getIdx(this.selectedStudentIdCol());
    const contactIdx = getIdx(this.selectedContactCol());
    const affIdx = getIdx(this.selectedAffiliationCol());

    return raw.slice(0, 3).map((row) => {
      let name = '';
      if (this.nameMode() === 'single') {
        name = fullIdx >= 0 ? row[fullIdx] ?? '' : '';
      } else {
        const f = firstIdx >= 0 ? row[firstIdx] ?? '' : '';
        const l = lastIdx >= 0 ? row[lastIdx] ?? '' : '';
        name = `${f} ${l}`.trim();
      }
      return {
        name: name || '—',
        email: emailIdx >= 0 ? row[emailIdx] ?? '—' : '—',
        studentId: studentIdx >= 0 ? row[studentIdx] ?? '—' : '—',
        contact: contactIdx >= 0 ? row[contactIdx] ?? '—' : '—',
        affiliation: affIdx >= 0 && row[affIdx] ? row[affIdx] : 'Guest / Imported Attendee',
      };
    });
  });

  reloadEvents(): void {
    this.organizerEvents.loadEvents().subscribe({
      error: () => this.errorMessage.set('Could not load events. Please try again later.'),
    });
  }

  setStatusFilter(filter: RegistrantFilter): void {
    this.statusFilter.set(filter);
  }

  statusClass(status: RegistrationStatus): string {
    switch (status) {
      case 'Checked In':
        return 'status-checked-in';
      case 'Cancelled':
        return 'status-cancelled';
      case 'Registered':
      default:
        return 'status-registered';
    }
  }

  openQrPass(registrant: EventRegistrant): void {
    this.activeQrRegistrant.set(registrant);
    this.qrLoading.set(true);
    this.qrDataUrl.set('');

    QRCode.toDataURL(registrant.ticket_id, {
      width: 280,
      margin: 1,
      color: { dark: '#0d5c46', light: '#ffffff' },
    })
      .then((url) => {
        this.qrDataUrl.set(url);
        this.qrLoading.set(false);
      })
      .catch(() => {
        this.qrLoading.set(false);
        this.errorMessage.set('Failed to generate QR pass.');
      });
  }

  closeQrPass(): void {
    this.activeQrRegistrant.set(null);
    this.qrDataUrl.set('');
    this.qrLoading.set(false);
  }

  downloadQr(registrant: EventRegistrant): void {
    const url = this.qrDataUrl();
    if (!url) return;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `ticket-${registrant.ticket_id}.png`;
    anchor.click();
  }

  confirmCancel(registrant: EventRegistrant): void {
    this.cancellingRegistrant.set(registrant);
  }

  dismissCancelDialog(): void {
    this.cancellingRegistrant.set(null);
  }

  executeCancel(): void {
    const toCancel = this.cancellingRegistrant();
    const eventId = this.eventId();
    if (!toCancel || !eventId) return;

    this.actionLoading.set(true);
    this.organizerEvents.cancelRegistrant(eventId, toCancel.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.dismissCancelDialog();
        this.successMessage.set(`Cancelled registration for ${toCancel.full_name}.`);
      },
      error: (err: HttpErrorResponse) => {
        this.actionLoading.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not cancel registration.');
      },
    });
  }

  confirmRestore(registrant: EventRegistrant): void {
    this.restoringRegistrant.set(registrant);
  }

  dismissRestoreDialog(): void {
    this.restoringRegistrant.set(null);
  }

  executeRestore(): void {
    const toRestore = this.restoringRegistrant();
    const eventId = this.eventId();
    if (!toRestore || !eventId) return;

    this.actionLoading.set(true);
    this.organizerEvents.restoreRegistrant(eventId, toRestore.id).subscribe({
      next: () => {
        this.actionLoading.set(false);
        this.dismissRestoreDialog();
        this.successMessage.set(`Restored active registration for ${toRestore.full_name}.`);
      },
      error: (err: HttpErrorResponse) => {
        this.actionLoading.set(false);
        this.errorMessage.set(err.error?.message ?? 'Could not restore registration.');
      },
    });
  }

  exportRegistrants(): void {
    const columns: (keyof EventRegistrant)[] = [
      'full_name',
      'email',
      'ticket_id',
      'registered_at',
      'status',
    ];
    const rows = this.allEventAttendees().map((attendee) =>
      columns.map((column) => this.escapeCsv(String(attendee[column]))).join(','),
    );
    const csv = [columns.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${this.event()?.name ?? 'event'}-registrants.csv`
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.errorMessage.set('');
    this.successMessage.set('');

    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      this.errorMessage.set('Please choose a .csv or .xlsx file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.errorMessage.set('File size exceeds the 5 MiB limit.');
      return;
    }

    const eventId = this.eventId();
    if (!eventId) {
      this.errorMessage.set('Event could not be determined.');
      return;
    }

    this.pendingFile.set(file);
    this.previewLoading.set(true);

    this.organizerEvents.previewGuestFile(eventId, file).subscribe({
      next: (preview: GuestFilePreview) => {
        this.previewLoading.set(false);
        this.detectedHeaders.set(preview.detectedHeaders);
        this.sampleRows.set(preview.sampleRows);
        this.totalFileRows.set(preview.totalRows);
        this.autoDetectColumns(preview.detectedHeaders);
        this.mappingModalOpen.set(true);
      },
      error: () => {
        this.previewLoading.set(false);
        // Fallback for CSV if preview endpoint fails
        if (/\.csv$/i.test(file.name)) {
          this.parseCsvFallback(file);
        } else {
          this.errorMessage.set('Could not inspect file columns. Please check file format.');
        }
      },
    });
  }

  private parseCsvFallback(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result ?? '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 1) {
        this.errorMessage.set('The uploaded CSV file is empty.');
        return;
      }
      const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());
      const sample = lines.slice(1, 4).map((line) =>
        line.split(',').map((cell) => cell.replace(/^"|"$/g, '').trim()),
      );
      this.detectedHeaders.set(headers);
      this.sampleRows.set(sample);
      this.totalFileRows.set(Math.max(0, lines.length - 1));
      this.autoDetectColumns(headers);
      this.mappingModalOpen.set(true);
    };
    reader.readAsText(file);
  }

  private autoDetectColumns(headers: string[]): void {
    const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

    let full = '';
    let first = '';
    let last = '';
    let email = '';
    let studentId = '';
    let contact = '';
    let affiliation = '';

    for (const h of headers) {
      const n = normalize(h);
      if (!email && (n.includes('email') || n.includes('mail'))) {
        email = h;
      } else if (!first && (n.includes('firstname') || n.includes('fname') || n === 'first')) {
        first = h;
      } else if (!last && (n.includes('lastname') || n.includes('lname') || n.includes('surname') || n === 'last')) {
        last = h;
      } else if (!full && (n.includes('fullname') || n === 'name' || n.includes('completename'))) {
        full = h;
      } else if (!studentId && (n.includes('studentid') || n.includes('studentno') || n.includes('idnumber') || n === 'id')) {
        studentId = h;
      } else if (!contact && (n.includes('phone') || n.includes('contact') || n.includes('mobile') || n.includes('cell') || n.includes('number'))) {
        contact = h;
      } else if (!affiliation && (n.includes('affiliation') || n.includes('org') || n.includes('company') || n.includes('department') || n.includes('dept'))) {
        affiliation = h;
      }
    }

    if (full || (!first && !last)) {
      this.nameMode.set('single');
      this.selectedFullNameCol.set(full || headers[0] || '');
    } else {
      this.nameMode.set('split');
      this.selectedFirstNameCol.set(first);
      this.selectedLastNameCol.set(last);
    }

    this.selectedEmailCol.set(email || headers.find((h) => normalize(h).includes('mail')) || headers[1] || '');
    this.selectedStudentIdCol.set(studentId);
    this.selectedContactCol.set(contact);
    this.selectedAffiliationCol.set(affiliation);
  }

  cancelMapping(): void {
    this.mappingModalOpen.set(false);
    this.pendingFile.set(null);
  }

  executeImport(): void {
    const file = this.pendingFile();
    const eventId = this.eventId();
    if (!file || !eventId || !this.isMappingValid()) return;

    this.importLoading.set(true);
    const mapping: GuestImportMapping = {
      hasHeaders: this.hasHeaders(),
      nameMode: this.nameMode(),
      ...(this.nameMode() === 'single'
        ? { fullNameColumn: this.selectedFullNameCol() }
        : {
            firstNameColumn: this.selectedFirstNameCol(),
            lastNameColumn: this.selectedLastNameCol(),
          }),
      emailColumn: this.selectedEmailCol(),
      ...(this.selectedStudentIdCol() ? { studentIdColumn: this.selectedStudentIdCol() } : {}),
      ...(this.selectedContactCol() ? { contactNumberColumn: this.selectedContactCol() } : {}),
      ...(this.selectedAffiliationCol() ? { affiliationColumn: this.selectedAffiliationCol() } : {}),
    };

    this.organizerEvents
      .importGuestUsers(eventId, file, this.includeCredentials(), mapping)
      .subscribe({
        next: (result) => {
          this.importLoading.set(false);
          this.mappingModalOpen.set(false);
          this.pendingFile.set(null);
          this.importResult.set(result);
          this.summaryModalOpen.set(true);
          this.successMessage.set(
            `Imported ${result.summary.created} attendee(s); skipped ${result.summary.skipped} row(s).`,
          );
          this.organizerEvents.loadRegistrants(eventId).subscribe();
        },
        error: (error: HttpErrorResponse) => {
          this.importLoading.set(false);
          const message = error.error?.message;
          this.errorMessage.set(
            Array.isArray(message)
              ? message.join(', ')
              : (message ?? 'Could not import guest accounts.'),
          );
        },
      });
  }

  closeSummaryModal(): void {
    this.summaryModalOpen.set(false);
  }

  copyAllCredentials(): void {
    const creds = this.importResult()?.credentials;
    if (!creds?.length) return;
    const text = creds
      .map((c) => `${c.email}: ${c.temporaryPassword}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    this.credentialsCopied.set(true);
    setTimeout(() => this.credentialsCopied.set(false), 2000);
  }

  copySingleCredential(cred: { email: string; temporaryPassword: string }): void {
    navigator.clipboard.writeText(cred.temporaryPassword);
  }

  private escapeCsv(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }
}
