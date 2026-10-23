import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

// Shared profile page for guests and every signed-in role.
@Component({
  imports: [RouterLink],
  selector: 'app-profile',
  styleUrl: './profile.component.scss',
  templateUrl: './profile.component.html',
})
export class Profile {
  protected readonly auth = inject(AuthService);
}
