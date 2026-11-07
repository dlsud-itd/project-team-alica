import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  submit(): void {
    this.errorMessage.set('');
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.errorMessage.set('Complete all password fields.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.errorMessage.set('Choose a password with at least 8 characters.');
      return;
    }
    if (this.currentPassword === this.newPassword) {
      this.errorMessage.set('Your new password must differ from the temporary password.');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage.set('The new passwords do not match.');
      return;
    }

    this.loading.set(true);
    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.router.navigateByUrl(
          user.role === 'ATTENDEE' ? '/profile' : this.auth.homeUrl(),
        );
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        const message = error.error?.message;
        this.errorMessage.set(
          Array.isArray(message)
            ? message.join(', ')
            : message ?? 'Could not change your password. Please try again.',
        );
      },
    });
  }
}
