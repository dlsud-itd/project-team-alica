import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { SavedProfile } from '../../../core/auth/auth.models';
import { AttendeeProgressService } from '../../../core/attendee/attendee-progress.service';
import { TicketProgress } from '../../../core/attendee/attendee-progress.models';
import { StampCardComponent } from '../../../shared/stamp-card/stamp-card.component';
import { environment } from '../../../../environments/environment';

export interface EventScheduleItem {
  id: string;
  time: string;
  title: string;
  description: string;
  type: string;
  location?: string;
  checkpointId?: string;
}

export interface EventSpeaker {
  id: string;
  name: string;
  role: string;
  company: string;
  avatarUrl?: string;
  topic?: string;
}

export interface EventDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: 'CONFERENCE' | 'HACKATHON' | 'WORKSHOP' | 'EXPO';
  categoryLabel: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  spotsTotal: number;
  spotsTaken: number;
  status: 'LIVE_TODAY' | 'OPEN' | 'CLOSING_SOON';
  statusLabel: string;
  organizerName: string;
  organizerId?: string;
  staffIds?: string[];
  registeredUserIds?: string[];
  durationDays: number;
  durationLabel: string;
  checkpointMode: string;
  scheduleDateLabel: string;
  schedule: EventScheduleItem[];
  speakers: EventSpeaker[];
  bannerImageUrl: string;
  requireStudentId?: boolean;
}

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, StampCardComponent],
  templateUrl: './event-details.component.html',
  styleUrl: './event-details.component.scss',
  host: { '[class.is-preview]': 'preview()' },
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);
  private readonly progressService = inject(AttendeeProgressService);

  /**
   * Preview mode (organizer Overview tab): render the page for this event id
   * exactly as attendees see it, minus navigation and registration actions.
   */
  readonly previewEventId = input<string>('');
  readonly preview = computed(() => !!this.previewEventId());

  /**
   * Controls rendering of the full Event Passport section.
   * Can be passed as an input prop or via ?passport=true query param.
   */
  readonly showPassport = input<boolean, unknown>(false, {
    transform: (v) => v === '' || v === true || v === 'true',
  });
  readonly passportFromRoute = signal(false);
  readonly isPassportVisible = computed(() => this.showPassport() || this.passportFromRoute());

  readonly event = signal<EventDetail | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal('');

  // Per-user progress for this event
  readonly userProgress = signal<TicketProgress | null>(null);
  readonly progressLoading = signal(false);

  // RSVP Modal State
  readonly isRsvpOpen = signal(false);
  readonly isSubmitting = signal(false);
  readonly rsvpError = signal('');
  readonly rsvpSuccess = signal<{ ticketCode: string; attendeeName: string } | null>(null);
  readonly copyFeedback = signal(false);
  readonly savedProfiles = signal<SavedProfile[]>([]);
  readonly selectedProfileId = signal<string>('');

  readonly rsvpForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    studentId: ['', [Validators.required]],
    saveProfile: [false],
    profileName: [''],
  });

  readonly isRegistered = computed(() => {
    const ev = this.event();
    const user = this.auth.user();
    if (!ev || !user) return false;
    return (ev.registeredUserIds?.includes(user.id) ?? false) || !!this.userProgress();
  });

  ngOnInit(): void {
    this.route.queryParamMap?.subscribe((params) => {
      const show = params.get('passport') === 'true' || params.get('showPassport') === 'true';
      this.passportFromRoute.set(show);
    });

    const previewId = this.previewEventId();
    if (previewId) {
      this.fetchEventDetails(previewId);
      return;
    }
    this.route.paramMap.subscribe((params) => {
      const idOrSlug = params.get('idOrSlug') || params.get('eventId');
      if (idOrSlug) {
        this.fetchEventDetails(idOrSlug);
      } else {
        this.loadError.set('No event specified');
        this.isLoading.set(false);
      }
    });
  }

  fetchEventDetails(idOrSlug: string): void {
    this.isLoading.set(true);
    this.loadError.set('');

    this.http
      .get<{ success: boolean; data: EventDetail }>(
        `${environment.apiUrl}/events/${idOrSlug}`,
      )
      .subscribe({
        next: (res) => {
          this.isLoading.set(false);
          if (res?.success && res.data) {
            this.event.set(res.data);
            this.loadUserProgress(res.data.id || idOrSlug);
          } else {
            this.loadError.set('Event not found');
          }
        },
        error: (err: HttpErrorResponse) => {
          this.isLoading.set(false);
          this.loadError.set(
            err.status === 404
              ? 'Event not found'
              : 'Unable to load event details. Please check your connection.',
          );
        },
      });
  }

  loadUserProgress(idOrSlug: string): void {
    if (!this.auth.isAuthenticated() || this.preview()) {
      this.userProgress.set(null);
      this.progressLoading.set(false);
      return;
    }

    this.progressLoading.set(true);
    this.progressService.loadMyProgressForEvent(idOrSlug).subscribe({
      next: (progress) => {
        this.userProgress.set(progress);
        this.progressLoading.set(false);
      },
      error: () => {
        this.userProgress.set(null);
        this.progressLoading.set(false);
      },
    });
  }

  openRsvpModal(): void {
    const ev = this.event();
    if (!ev || this.preview()) return;

    // Student ID is only mandatory when the organizer requires it for this event.
    const studentIdControl = this.rsvpForm.controls.studentId;
    studentIdControl.setValidators(ev.requireStudentId ? [Validators.required] : []);
    studentIdControl.updateValueAndValidity();

    this.isRsvpOpen.set(true);
    this.rsvpSuccess.set(null);
    this.rsvpError.set('');
    this.copyFeedback.set(false);
    this.selectedProfileId.set('');

    const user = this.auth.user();
    if (user) {
      this.rsvpForm.patchValue({
        fullName: user.fullName,
        email: user.email,
        studentId: user.studentId || '',
        saveProfile: false,
        profileName: '',
      });
      this.auth.getProfiles().subscribe({
        next: (profiles) => {
          this.savedProfiles.set(profiles);
        },
        error: () => {
          this.savedProfiles.set([]);
        },
      });
    } else {
      this.savedProfiles.set([]);
      this.rsvpForm.reset({
        fullName: '',
        email: '',
        studentId: '',
        saveProfile: false,
        profileName: '',
      });
    }
  }

  closeRsvpModal(): void {
    this.isRsvpOpen.set(false);
  }

  onSelectProfile(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const profileId = target.value;
    this.selectedProfileId.set(profileId);
    if (!profileId) {
      const user = this.auth.user();
      if (user) {
        this.rsvpForm.patchValue({
          fullName: user.fullName,
          studentId: user.studentId || '',
        });
      }
      return;
    }

    const found = this.savedProfiles().find((p) => p.id === profileId);
    if (found) {
      this.rsvpForm.patchValue({
        fullName: found.fullName,
        studentId: found.studentId || '',
      });
    }
  }

  submitRsvp(): void {
    if (this.rsvpForm.invalid) {
      this.rsvpForm.markAllAsTouched();
      return;
    }

    const currentEvent = this.event();
    if (!currentEvent) return;

    this.isSubmitting.set(true);
    this.rsvpError.set('');

    const formVal = this.rsvpForm.getRawValue();
    const currentUser = this.auth.user();

    const payload = {
      eventId: currentEvent.id,
      fullName: formVal.fullName,
      email: formVal.email,
      studentId: formVal.studentId,
      userId: currentUser?.id,
    };

    if (currentUser && formVal.saveProfile && formVal.profileName?.trim()) {
      this.auth
        .saveProfile({
          profileName: formVal.profileName.trim(),
          fullName: formVal.fullName.trim(),
          studentId: formVal.studentId.trim(),
        })
        .subscribe({
          next: (saved) => {
            this.savedProfiles.update((list) => [...list, saved]);
          },
          error: () => {},
        });
    }

    this.http
      .post<{
        success: boolean;
        data: {
          ticketCode: string;
          qrPayload: string;
          attendeeName: string;
          eventId: string;
        };
      }>(`${environment.apiUrl}/registrations`, payload)
      .subscribe({
        next: (res) => {
          this.isSubmitting.set(false);
          this.rsvpSuccess.set({
            ticketCode: res.data.ticketCode,
            attendeeName: res.data.attendeeName,
          });

          // Optimistically mark as registered in current event state
          if (currentUser?.id) {
            this.event.update((prev) => {
              if (!prev) return prev;
              const registered = prev.registeredUserIds ? [...prev.registeredUserIds] : [];
              if (!registered.includes(currentUser.id)) {
                registered.push(currentUser.id);
              }
              return {
                ...prev,
                registeredUserIds: registered,
                spotsTaken: prev.spotsTaken + 1,
              };
            });
          }
          this.loadUserProgress(currentEvent.id);
        },
        error: (err: HttpErrorResponse) => {
          this.isSubmitting.set(false);
          this.rsvpError.set(
            err.error?.message ?? 'Could not complete your RSVP. Please try again.',
          );
        },
      });
  }

  copyTicketCode(code: string): void {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        this.copyFeedback.set(true);
        setTimeout(() => this.copyFeedback.set(false), 2000);
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/events']);
  }
}
