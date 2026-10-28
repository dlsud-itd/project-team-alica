import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

// Desktop-only. Sidebar/top nav to be added later.
@Component({
  imports: [RouterOutlet],
  selector: 'app-admin-layout',
  styleUrl: './admin-layout.component.scss',
  templateUrl: './admin-layout.component.html',
})
export class AdminLayout {}
