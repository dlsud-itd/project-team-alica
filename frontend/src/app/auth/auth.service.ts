import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type RegisterPayload = {
  fullName: string;
  email: string;
  password: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private api = environment.apiUrl;

  register(data: RegisterPayload): Observable<unknown> {
    return this.http.post(`${this.api}/auth/register`, data);
  }
}