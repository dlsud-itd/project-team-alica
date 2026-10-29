import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-public-layout',
  styleUrl: './public-layout.component.scss',
  templateUrl: './public-layout.component.html',
})
export class PublicLayout {
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
