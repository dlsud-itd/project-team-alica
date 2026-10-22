import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export interface NavItem {
  label: string;
  path: string;
}

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-bottom-nav',
  styleUrl: './bottom-nav.component.scss',
  templateUrl: './bottom-nav.component.html',
})
export class BottomNav {
  readonly items = input.required<NavItem[]>();
}
