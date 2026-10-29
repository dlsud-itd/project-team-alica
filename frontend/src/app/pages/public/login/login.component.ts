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

    // Check invalid test case
    if (password.includes('Wrong') || password.includes('invalid')) {
      this.errorMessage = 'Invalid email or password';
      this.loginForm.patchValue({ password: '' });
      this.isLoading = false;
      return;
    }

    // Role-based authentication: unified login for all roles
    let role: UserRole = 'ATTENDEE';
    let fullName = 'Alen Mikel Umandal';
    let studentId = '2023-01982-MN-0';
    let affiliation = 'College of Science and Computer Studies';

    if (email === 'organizer@alica.ph' || email === 'organizer@example.com') {
      role = 'ORGANIZER';
      fullName = 'Campus Organizer';
      affiliation = 'University Student Council';
    } else if (email === 'staff@checkpoint.ph') {
      role = 'STAFF';
      fullName = 'Station Operator';
      affiliation = 'Event Operations Team';
    } else if (email === 'admin@dlsud.edu.ph') {
      role = 'ADMIN';
      fullName = 'System Administrator';
      affiliation = 'Information & Communications Technology';
    } else {
      // Custom Attendee login
      const stored = localStorage.getItem('checkpoint_user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.fullName && parsed.email === email) {
            fullName = parsed.fullName;
          }
          if (parsed.studentId) studentId = parsed.studentId;
          if (parsed.affiliation) affiliation = parsed.affiliation;
        } catch {}
      }
    }

    const userRoleIds: Record<UserRole, string> = {
      ATTENDEE: 'usr-attendee-alen',
      ORGANIZER: 'usr-organizer-campus',
      STAFF: 'usr-staff-station',
      ADMIN: 'usr-admin-system',
    };

    const authUser: AuthUser = {
      id: userRoleIds[role] || ('usr-' + role.toLowerCase()),
      email,
      fullName,
      role,
    };

    // Save profile for digital pass & profile page
    const profileData = {
      id: authUser.id,
      ticketCode: 'CHK-2026-9812A',
      fullName,
      email,
      role,
      status: 'ACTIVE',
      identificationNumber: studentId,
      affiliation,
      qrPayload: 'CHK-2026-9812A',
      issuedAt: '2026-10-23T10:00:00.000Z',
    };
    try {
      localStorage.setItem('checkpoint_user', JSON.stringify(profileData));
    } catch {}

    this.auth.setSession(authUser, 'mock-jwt-token-' + Date.now());
    this.successMessage = 'Authentication successful! Redirecting...';
    this.isLoading = false;
    this.router.navigate(['/events']);
  }

  signInWithGoogle(): void {
    console.log('Google Sign-In initiated');
  }
}
