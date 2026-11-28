import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../core/auth/auth.service';
import { OrganizerEventsService } from '../../../core/organizer/organizer-events.service';
import {
  EventOrganizer,
  OrganizerCandidate,
  OrganizerEvent,
} from '../../../core/organizer/organizer.models';

@Component({
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  selector: 'app-event-settings',
  styleUrl: './event_settings.component.scss',
  templateUrl: './event_settings.component.html',
})
export class EventSettingsComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly organizerEvents = inject(OrganizerEventsService);
  readonly auth = inject(AuthService);

  @ViewChild('deleteDialog') private deleteDialogRef?: ElementRef<HTMLDialogElement>;

  readonly eventId = signal('');
  readonly isSavingPolicies = signal(false);
  readonly policiesSuccess = signal('');
  readonly policiesError = signal('');

  // Organizers state & directory autocomplete
  readonly organizers = signal<EventOrganizer[]>([]);
  readonly organizersLoading = signal(false);
  readonly addingOrganizer = signal(false);
  readonly organizerError = signal('');
  readonly organizerSuccess = signal('');
  readonly orgQuery = signal('');
  readonly orgCandidates = signal<OrganizerCandidate[]>([]);
  readonly isSearchingOrg = signal(false);
  readonly showOrgDropdown = signal(false);
  private readonly orgSearch$ = new Subject<string>();

  // Delete state
  readonly deleting = signal(false);
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  private routeSub?: Subscription;
  private pressedOutsideDialog = false;

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

  readonly policiesForm = new FormGroup({
    is_private: new FormControl(false, { nonNullable: true }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
    require_student_id: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    const searchSub = this.orgSearch$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (trimmed.length < 2 || !this.organizerEvents.searchOrganizerCandidates) {
            this.isSearchingOrg.set(false);
            return of([]);
          }
          this.isSearchingOrg.set(true);
          return this.organizerEvents.searchOrganizerCandidates(trimmed).pipe(
            catchError(() => of([])),
            finalize(() => this.isSearchingOrg.set(false)),
          );
        }),
      )
      .subscribe((candidates) => {
        const existingIds = new Set(this.organizers().map((o) => o.userId));
        this.orgCandidates.set(candidates.filter((c) => !existingIds.has(c.id)));
        this.isSearchingOrg.set(false);
      });

    this.destroyRef.onDestroy(() => searchSub.unsubscribe());
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
        }
      });
    } else {
      const id = this.route.snapshot.paramMap.get('eventId') ?? '';
      if (id) {
        this.eventId.set(id);
        this.syncEventData();
        this.loadOrganizers(id);
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
    this.policiesForm.patchValue({
      is_private: ev.is_private ?? false,
      allow_walk_ins: ev.allow_walk_ins,
      require_student_id: ev.require_student_id ?? false,
    });
  }

  savePolicies(): void {
    const ev = this.event();
    if (!ev || this.isSavingPolicies()) return;

    const raw = this.policiesForm.getRawValue();
    this.isSavingPolicies.set(true);
    this.policiesError.set('');
    this.policiesSuccess.set('');

    this.organizerEvents
      .updateEvent(ev.id, {
        is_private: raw.is_private,
        allow_walk_ins: raw.allow_walk_ins,
        require_student_id: raw.require_student_id,
      })
      .subscribe({
        next: (saved) => {
          this.isSavingPolicies.set(false);
          this.policiesSuccess.set(`Event policies for "${saved.name}" have been updated.`);
        },
        error: (err: { error?: { message?: string } }) => {
          this.isSavingPolicies.set(false);
          this.policiesError.set(err.error?.message ?? 'Could not save event policies.');
        },
      });
  }

  // ---- Organizers & Directory Autocomplete ----

  isEmailFormat(text: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((text || '').trim());
  }

  onOrgInput(value: string): void {
    this.orgQuery.set(value);
    this.organizerError.set('');
    const trimmed = value.trim();
    if (trimmed.length >= 2) {
      this.showOrgDropdown.set(true);
      this.orgSearch$.next(trimmed);
    } else {
      this.showOrgDropdown.set(false);
      this.orgCandidates.set([]);
    }
  }

  onOrgFocus(): void {
    if (this.orgQuery().trim().length >= 2) {
      this.showOrgDropdown.set(true);
    }
  }

  onOrgBlur(): void {
    setTimeout(() => {
      this.showOrgDropdown.set(false);
    }, 200);
  }

  selectCandidate(candidate: OrganizerCandidate, input?: HTMLInputElement): void {
    this.showOrgDropdown.set(false);
    this.orgCandidates.set([]);
    this.orgQuery.set('');
    if (input) input.value = candidate.email;
    this.submitAddOrganizer(candidate.email, input);
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

  addOrganizerMember(emailInput: HTMLInputElement): void {
    const cleanEmail = emailInput.value.trim().toLowerCase();
    if (!cleanEmail) return;
    this.submitAddOrganizer(cleanEmail, emailInput);
  }

  private submitAddOrganizer(email: string, emailInput?: HTMLInputElement): void {
    const cleanEmail = email.trim().toLowerCase();
    const id = this.eventId();
    if (!cleanEmail || !id || this.addingOrganizer()) return;

    this.addingOrganizer.set(true);
    this.organizerError.set('');
    this.organizerSuccess.set('');
    this.showOrgDropdown.set(false);

    this.organizerEvents.addOrganizer(id, cleanEmail).subscribe({
      next: (added) => {
        this.addingOrganizer.set(false);
        this.orgQuery.set('');
        this.orgCandidates.set([]);
        if (emailInput) emailInput.value = '';
        this.organizerSuccess.set(`Added ${added.fullName} (${added.email}) as co-organizer.`);
        this.loadOrganizers(id);
      },
      error: (err: { error?: { message?: string } }) => {
        this.addingOrganizer.set(false);
        this.organizerError.set(
          err.error?.message ?? 'Failed to add co-organizer. Ensure the email is valid.',
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

  // ---- Delete Event Dialog ----

  openDelete(): void {
    this.deleteError.set('');
    this.deleting.set(true);
    const el = this.deleteDialogRef?.nativeElement;
    if (el) {
      if (typeof el.showModal === 'function') {
        if (!el.open) el.showModal();
      } else {
        el.setAttribute('open', '');
      }
    }
  }

  closeDelete(): void {
    this.deleting.set(false);
    this.deleteError.set('');
    const el = this.deleteDialogRef?.nativeElement;
    if (el) {
      if (typeof el.close === 'function') {
        if (el.open) el.close();
      } else {
        el.removeAttribute('open');
      }
    }
  }

  onDeleteDialogClosed(): void {
    this.deleting.set(false);
    this.deleteError.set('');
  }

  onDeleteDialogPointerDown(event: PointerEvent, dialog: HTMLDialogElement): void {
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) return;
    this.pressedOutsideDialog = this.isOutsideDialog(event, dialog);
  }

  onDeleteDialogPointerUp(event: PointerEvent, dialog: HTMLDialogElement): void {
    if (typeof HTMLDialogElement !== 'undefined' && 'closedBy' in HTMLDialogElement.prototype) return;
    if (this.pressedOutsideDialog && this.isOutsideDialog(event, dialog)) {
      this.pressedOutsideDialog = false;
      this.closeDelete();
      return;
    }
    this.pressedOutsideDialog = false;
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
