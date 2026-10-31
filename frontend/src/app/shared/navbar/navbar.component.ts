import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-navbar',
  styleUrl: './navbar.component.scss',
  templateUrl: './navbar.component.html',
})
export class NavbarComponent {
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
