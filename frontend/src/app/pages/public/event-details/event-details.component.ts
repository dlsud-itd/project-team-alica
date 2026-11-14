import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import { SavedProfile } from '../../../core/auth/auth.models';
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
}

@Component({
  selector: 'app-event-details',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './event-details.component.html',
  styleUrl: './event-details.component.scss',
})
export class EventDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  readonly auth = inject(AuthService);

  readonly event = signal<EventDetail | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal('');

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
    return ev.registeredUserIds?.includes(user.id) ?? false;
  });

  ngOnInit(): void {
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

  openRsvpModal(): void {
    const ev = this.event();
    if (!ev) return;

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
