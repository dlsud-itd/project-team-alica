import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, from, map, tap } from 'rxjs';
import * as QRCode from 'qrcode';
import { environment } from '../../../environments/environment';
import { AttendeeRsvp } from './attendee-rsvp.models';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AttendeeRsvpService {
  private readonly http = inject(HttpClient);
  private readonly rsvpState = signal<AttendeeRsvp[]>([]);

  readonly rsvps = this.rsvpState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal('');

  private get api(): string {
    return `${environment.apiUrl}/registrations`;
  }

  loadMyRsvps(): Observable<AttendeeRsvp[]> {
    this.loading.set(true);
    this.error.set('');
    return this.http.get<ApiResponse<AttendeeRsvp[]>>(`${this.api}/mine`).pipe(
      map((res) => res.data),
      tap({
        next: (items) => {
          this.rsvpState.set(items);
        },
        error: (err: { error?: { message?: unknown } }) => {
          const message = err.error?.message;
          this.error.set(
            typeof message === 'string'
              ? message
              : 'Unable to load your event reservations. Please check your connection and try again.',
          );
        },
      }),
      finalize(() => this.loading.set(false)),
    );
  }

  cancelRsvp(ticketCode: string): Observable<AttendeeRsvp> {
    return this.http
      .patch<ApiResponse<AttendeeRsvp>>(`${this.api}/${ticketCode}/cancel`, {})
      .pipe(
        map((res) => res.data),
        tap((updated) => {
          this.rsvpState.update((current) =>
            current.map((item) => (item.ticketCode === updated.ticketCode ? updated : item)),
          );
        }),
      );
  }

  generateQrCode(payload: string): Observable<string> {
    const options: QRCode.QRCodeToDataURLOptions = {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 8,
    };
    return from(QRCode.toDataURL(payload, options));
  }
}
