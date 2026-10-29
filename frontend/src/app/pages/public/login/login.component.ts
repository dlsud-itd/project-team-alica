import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { AuthUser, UserRole } from '../../../core/auth/auth.models';

@Component({
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
})
export class Login implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
    rememberMe: new FormControl(false, { nonNullable: true }),
  });

  showPassword = false;
  isLoading = false;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  ngOnInit(): void {
    const isRegistered = this.route.snapshot.queryParamMap.get('registered');
    if (isRegistered === 'true' || isRegistered === '') {
      this.successMessage = 'Account created successfully! Please sign in.';
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  fillDemo(role: 'attendee' | 'organizer' | 'staff' | 'admin'): void {
    const creds = {
      attendee: { email: 'amc.umandal@gmail.com', pass: 'SecurePassword123!' },
      organizer: { email: 'organizer@alica.ph', pass: 'SecurePassword123!' },
      staff: { email: 'staff@checkpoint.ph', pass: 'SecurePassword123!' },
      admin: { email: 'admin@dlsud.edu.ph', pass: 'SecurePassword123!' },
    }[role];

    this.loginForm.patchValue({
      email: creds.email,
      password: creds.pass,
    });
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;
    this.successMessage = null;

    const { email, password } = this.loginForm.getRawValue();

    this.auth.login({ email, password }).subscribe({
      next: (res) => {
        const { user, token } = res.data;
        this.auth.setSession(user, token);

        // Store profile for digital pass & profile page
        const profileData = {
          id: user.id,
          ticketCode: 'CHK-2026-9812A',
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: 'ACTIVE',
          identificationNumber: user.studentId || '2023-01982-MN-0',
          affiliation:
            user.affiliation || 'College of Science and Computer Studies',
          qrPayload: 'CHK-2026-9812A',
          issuedAt: new Date().toISOString(),
        };

        try {
          localStorage.setItem('checkpoint_user', JSON.stringify(profileData));
          localStorage.setItem('user_profile', JSON.stringify(profileData));
        } catch {}

        this.successMessage = 'Authentication successful! Redirecting...';
        this.isLoading = false;
        this.router.navigate([this.auth.homeUrl()]);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage =
          err?.error?.message ??
          (err?.status === 0
            ? 'Unable to connect to the authentication server.'
            : 'Invalid email or password');
        this.loginForm.patchValue({ password: '' });
      },
    });
  }

  signInWithGoogle(): void {
    console.log('Google Sign-In initiated');
  }
}
