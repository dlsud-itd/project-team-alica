import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
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

}
