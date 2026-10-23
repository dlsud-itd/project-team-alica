import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

// Shared by attendee, staff, and organizer routes.
@Component({
  imports: [],
  selector: 'app-profile',
  styleUrl: './profile.component.scss',
  templateUrl: './profile.component.html',
})
export class Profile {
  protected readonly auth = inject(AuthService);
}
