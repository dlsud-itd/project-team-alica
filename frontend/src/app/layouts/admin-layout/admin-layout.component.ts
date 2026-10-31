import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopNav } from '../../shared/top-nav/top-nav.component';

// Desktop-only, with the top header instead of the floating nav.
@Component({
  imports: [RouterOutlet, TopNav],
  selector: 'app-admin-layout',
  styleUrl: './admin-layout.component.scss',
  templateUrl: './admin-layout.component.html',
})
export class AdminLayout {}
