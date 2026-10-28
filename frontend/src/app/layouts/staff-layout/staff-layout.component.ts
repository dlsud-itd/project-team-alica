import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { STAFF_GUEST_NAV, STAFF_NAV } from '../nav-items';

@Component({
  imports: [RouterOutlet, BottomNav],
  selector: 'app-staff-layout',
  styleUrl: './staff-layout.component.scss',
  templateUrl: './staff-layout.component.html',
})
export class StaffLayout {
  private readonly auth = inject(AuthService);

  readonly navItems = computed(() => (this.auth.isAuthenticated() ? STAFF_NAV : STAFF_GUEST_NAV));
}
