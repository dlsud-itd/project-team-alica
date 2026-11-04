import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { ORGANIZER_NAV } from '../nav-items';

@Component({
  imports: [RouterOutlet, BottomNav, NavbarComponent],
  selector: 'app-organizer-layout',
  styleUrl: './organizer-layout.component.scss',
  templateUrl: './organizer-layout.component.html',
})
export class OrganizerLayout {
  readonly navItems = ORGANIZER_NAV;
}
