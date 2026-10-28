import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthUser, ROLE_HOME, UserRole } from './auth.models';

export type RegisterPayload = {
  fullName: string;
  email: string;
  password: string;
};

const STORAGE_KEY = 'checkpoint.session';

interface Session {
  user: AuthUser;
  token: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;
  private readonly session = signal<Session | null>(this.restore());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly token = computed(() => this.session()?.token ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  register(data: RegisterPayload): Observable<unknown> {
    return this.http.post(`${this.api}/auth/register`, data);
  }

  /** Call this after a successful login/register API response. */
  setSession(user: AuthUser, token: string): void {
    const session = { user, token };
    this.session.set(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable (e.g. private mode); session lives in memory only.
    }
  }

  logout(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    this.router.navigateByUrl('/login');
  }

  hasRole(...roles: UserRole[]): boolean {
    const role = this.user()?.role;
    return role !== undefined && roles.includes(role);
  }

  /** Home route for the current user's role, or the public events page. */
  homeUrl(): string {
    const role = this.user()?.role;
    return role ? ROLE_HOME[role] : '/events';
  }

  private restore(): Session | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
}
