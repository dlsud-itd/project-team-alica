import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { ATTENDEE_NAV, GUEST_NAV, ORGANIZER_NAV, STAFF_NAV } from '../nav-items';

@Component({
  imports: [RouterOutlet, RouterLink, BottomNav],
  selector: 'app-public-layout',
  styleUrl: './public-layout.component.scss',
  templateUrl: './public-layout.component.html',
})
export class PublicLayout {
  readonly auth = inject(AuthService);

  readonly navItems = computed(() => {
    const role = this.auth.user()?.role;
    if (role === 'ORGANIZER') return ORGANIZER_NAV;
    if (role === 'STAFF') return STAFF_NAV;
    if (role === 'ATTENDEE') return ATTENDEE_NAV;
    return GUEST_NAV;
  });

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
