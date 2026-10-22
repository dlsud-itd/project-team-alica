import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UserRole } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav, NavItem } from '../../shared/bottom-nav/bottom-nav.component';
import { ATTENDEE_NAV, GUEST_NAV, ORGANIZER_NAV, STAFF_NAV } from '../nav-items';

const ROLE_NAV: Record<UserRole, NavItem[]> = {
  ADMIN: [],
  ORGANIZER: ORGANIZER_NAV,
  STAFF: STAFF_NAV,
  ATTENDEE: ATTENDEE_NAV,
};

@Component({
  imports: [RouterOutlet, BottomNav],
  selector: 'app-public-layout',
  styleUrl: './public-layout.component.scss',
  templateUrl: './public-layout.component.html',
})
export class PublicLayout {
  private readonly auth = inject(AuthService);

  readonly navItems = computed(() => {
    const role = this.auth.user()?.role;
    return role ? ROLE_NAV[role] : GUEST_NAV;
  });
}
