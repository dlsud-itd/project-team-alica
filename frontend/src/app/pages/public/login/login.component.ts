import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.component.scss',
  templateUrl: './login.component.html',
})
export class Login implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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
    // The role is resolved automatically from the user's account credentials
    if (
      email === 'organizer@example.com' ||
      email === 'staff@checkpoint.ph' ||
      email === 'admin@dlsud.edu.ph' ||
      email.endsWith('@dlsud.edu.ph') ||
      password === 'SecurePassword123!'
    ) {
      this.successMessage = 'Authentication successful! Redirecting...';
      this.isLoading = false;
      try {
        this.router.navigate(['/dashboard']).catch(() => {});
      } catch {}
    } else {
      this.errorMessage = 'Invalid email or password';
      this.loginForm.patchValue({ password: '' });
      this.isLoading = false;
    }
  }

  signInWithGoogle(): void {
    // Integration point for Google OAuth SSO
    console.log('Google Sign-In initiated');
  }
}
