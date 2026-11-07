import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { StaffCheckpoint } from './scanner.models';

export interface CreateSubBoothPayload {
  name: string;
  location?: string;
}

@Injectable({ providedIn: 'root' })
export class SubBoothApi {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = environment.apiUrl;

  /** All checkpoints (booths, gates, sub-booths). The page filters them by event. */
  listAll(): Observable<StaffCheckpoint[]> {
    return this.http
      .get<{ success: boolean; data: StaffCheckpoint[] }>(`${this.apiUrl}/checkpoints`, {
        headers: this.buildHeaders(),
      })
      .pipe(map((res) => res.data));
  }

  /** Create a sub-booth under the given parent booth. */
  create(parentId: string, payload: CreateSubBoothPayload): Observable<StaffCheckpoint> {
    return this.http
      .post<{ success: boolean; data: StaffCheckpoint }>(
        `${this.apiUrl}/checkpoints/${parentId}/sub-booths`,
        payload,
        { headers: this.buildHeaders() },
      )
      .pipe(map((res) => res.data));
  }

  private buildHeaders(): HttpHeaders {
    let headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    const token = this.auth.token();
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }
}
