import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AttendeeEventsService } from '../../../../core/attendee/attendee-events.service';
import { OrganizerEvent } from '../../../../core/organizer/organizer.models';

function toDateTimeLocalInput(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  selector: 'app-submit-event',
  styleUrl: './submit-event.component.scss',
  templateUrl: './submit-event.component.html',
})
export class SubmitEvent implements OnInit {
  private readonly eventsService = inject(AttendeeEventsService);

  readonly events = this.eventsService.submitted;
  readonly loading = this.eventsService.loading;
  readonly loadError = this.eventsService.error;

  readonly dialogOpen = signal(false);
  readonly isSaving = signal(false);
  readonly errorMessage = signal('');
  readonly notice = signal('');
  readonly minStart = toDateTimeLocalInput(new Date());

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    venue: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    starts_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    ends_at: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    capacity: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    description: new FormControl('', { nonNullable: true }),
    allow_walk_ins: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.eventsService.loadSubmitted().subscribe({ error: () => undefined });
  }

  openDialog(): void {
    this.form.reset();
    this.errorMessage.set('');
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.errorMessage.set('');
  }

  submit(): void {
    if (this.form.invalid) {
      this.errorMessage.set('Please fill out all required fields.');
      return;
    }

    const raw = this.form.getRawValue();
    const startDate = new Date(raw.starts_at);
    const endDate = new Date(raw.ends_at);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      this.errorMessage.set('Please provide valid start and end dates.');
      return;
    }
    if (endDate <= startDate) {
      this.errorMessage.set('End date & time must be after the start date & time.');
      return;
    }
    if (startDate <= new Date()) {
      this.errorMessage.set('Start date & time must be in the future.');
      return;
    }

    this.isSaving.set(true);
    this.eventsService
      .submit({
        name: raw.name.trim(),
        description: raw.description.trim(),
        venue: raw.venue.trim(),
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
        capacity: Number(raw.capacity),
        allow_walk_ins: raw.allow_walk_ins,
      })
      .subscribe({
        next: (created) => {
          this.isSaving.set(false);
          this.closeDialog();
          this.notice.set(`"${created.name}" was submitted and is waiting for admin approval.`);
          setTimeout(() => this.notice.set(''), 5000);
        },
        error: (err: HttpErrorResponse) => {
          this.isSaving.set(false);
          this.errorMessage.set(err.error?.message ?? 'Could not submit the event. Please try again.');
        },
      });
  }

  statusLabel(event: OrganizerEvent): string {
    switch (event.approval_status) {
      case 'Approved':
        return 'Approved';
      case 'Rejected':
        return 'Rejected';
      default:
        return 'Waiting for admin approval';
    }
  }
}