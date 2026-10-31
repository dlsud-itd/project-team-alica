import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BottomNav } from '../../shared/bottom-nav/bottom-nav.component';
import { NavbarComponent } from '../../shared/navbar/navbar.component';
import { ATTENDEE_NAV } from '../nav-items';

@Component({
  imports: [RouterOutlet, BottomNav, NavbarComponent],
  selector: 'app-attendee-layout',
  styleUrl: './attendee-layout.component.scss',
  templateUrl: './attendee-layout.component.html',
})
export class AttendeeLayout {
  readonly navItems = ATTENDEE_NAV;
}
