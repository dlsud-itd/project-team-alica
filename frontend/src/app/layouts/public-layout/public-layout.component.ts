import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { ATTENDEE_NAV, GUEST_NAV, ORGANIZER_NAV, STAFF_NAV } from '../nav-items';

@Component({
  imports: [RouterOutlet, NavbarComponent, BottomNav],
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
}
