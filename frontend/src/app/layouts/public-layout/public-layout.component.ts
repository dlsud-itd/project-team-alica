import { Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { TopNav } from '../../shared/top-nav/top-nav.component';
import { navForRole } from '../nav-items';

@Component({
  imports: [RouterOutlet, BottomNav, TopNav],
  selector: 'app-public-layout',
  styleUrl: './public-layout.component.scss',
  templateUrl: './public-layout.component.html',
})
export class PublicLayout {
  private readonly auth = inject(AuthService);

  // Admins get the top header; everyone else gets the floating nav.
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly navItems = computed(() => navForRole(this.auth.user()?.role));
}
