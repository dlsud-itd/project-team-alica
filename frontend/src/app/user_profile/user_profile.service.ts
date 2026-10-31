import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { map } from 'rxjs/operators';
import * as QRCode from 'qrcode';
import { environment } from '../../environments/environment';
import { UserProfile, ApiResponse } from './user_profile.model';

@Injectable({
  providedIn: 'root',
})
export class UserProfileService {
  constructor(private readonly httpClient: HttpClient) {}

  /** Loads a ticket by code, or the signed-in user's latest ticket when no code is given. */
  getProfile(ticketCode?: string): Observable<UserProfile> {
    const targetUrl = ticketCode
      ? `${environment.apiUrl}/registrations/${encodeURIComponent(ticketCode)}`
      : `${environment.apiUrl}/registrations/me`;

    return this.httpClient
      .get<ApiResponse<UserProfile>>(targetUrl)
      .pipe(map((response: ApiResponse<UserProfile>) => response.data));
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
}
