import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// Admin-only header; other roles use the floating bottom nav.
@Component({
  imports: [RouterLink],
  selector: 'app-top-nav',
  styleUrl: './top-nav.component.scss',
  templateUrl: './top-nav.component.html',
})
export class TopNav {
  readonly auth = inject(AuthService);

  onQuickLogout(): void {
    try {
      localStorage.removeItem('checkpoint_user');
      localStorage.removeItem('registered_attendee');
      localStorage.removeItem('checkpoint.session');
      sessionStorage.clear();
    } catch {
      // Storage unavailable fallback
    }
    this.auth.logout('/events');
  }
}
