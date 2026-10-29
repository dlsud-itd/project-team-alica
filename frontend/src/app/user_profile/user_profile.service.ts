import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import * as QRCode from 'qrcode';
import { environment } from '../../environments/environment';
import {
  UserProfile,
  UserRole,
  ProfileStatus,
  ApiResponse,
} from './user_profile.model';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  private readonly defaultMockProfile: UserProfile = {
    id: 'usr-attendee-alen',
    ticketCode: 'CHK-2026-9812A',
    fullName: 'Alen Mikel Umandal',
    firstName: 'Alen Mikel',
    lastName: 'Umandal',
    email: 'amc.umandal@gmail.com',
    phoneNumber: '+63 917 123 4567',
    role: UserRole.ATTENDEE,
    status: ProfileStatus.ACTIVE,
    identificationNumber: '2023-01982-MN-0',
    eventName: 'DLSU-D Tech Summit 2026',
    issuedAt: '2026-10-23T10:00:00.000Z',
    qrPayload: 'CHK-2026-9812A',
  };

  constructor(private readonly httpClient: HttpClient) {}

  getProfile(ticketCode?: string): Observable<UserProfile> {
    const targetUrl = ticketCode
      ? `${environment.apiUrl}/registrations/${ticketCode}`
      : `${environment.apiUrl}/auth/me`;

    return this.httpClient
      .get<ApiResponse<UserProfile>>(targetUrl)
      .pipe(
        map((response: ApiResponse<UserProfile>) => response.data),
        catchError(() => {
          const stored = this.getStoredProfile();
          if (stored) {
            if (ticketCode && stored.ticketCode !== ticketCode) {
              return of({
                ...stored,
                ticketCode,
                qrPayload: ticketCode,
              });
            }
            return of(stored);
          }

          if (ticketCode) {
            return of({
              ...this.defaultMockProfile,
              ticketCode,
              qrPayload: ticketCode,
            });
          }

          return of(this.defaultMockProfile);
        })
      );
  }

  saveProfile(profile: UserProfile): Observable<UserProfile> {
    try {
      localStorage.setItem('checkpoint_user', JSON.stringify(profile));
    } catch {
      // Storage unavailable fallback
    }
    return of(profile);
  }

  generateQrCode(payload: string): Observable<string> {
    const options: QRCode.QRCodeToDataURLOptions = {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f6e56',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    };

    return from(QRCode.toDataURL(payload, options));
  }

  private getStoredProfile(): UserProfile | null {
    try {
      const stored =
        localStorage.getItem('checkpoint_user') ||
        localStorage.getItem('registered_attendee');

      if (stored) {
        return JSON.parse(stored) as UserProfile;
      }

      const session = localStorage.getItem('checkpoint.session');
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed?.user) {
          return {
            id: parsed.user.id || 'usr-attendee',
            ticketCode: 'CHK-2026-9812A',
            fullName: parsed.user.fullName,
            email: parsed.user.email,
            role: parsed.user.role as UserRole,
            status: ProfileStatus.ACTIVE,
            identificationNumber: '2023-01982-MN-0',
            eventName: 'DLSU-D Tech Summit 2026',
            issuedAt: '2026-10-23T10:00:00.000Z',
            qrPayload: 'CHK-2026-9812A',
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }
}
