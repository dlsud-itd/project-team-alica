import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = false;
  errorMsg = '';
  showPassword = false;

  form = this.fb.nonNullable.group({
    fullName: ['', { validators: [Validators.required] }],
    email: ['', { validators: [Validators.required, Validators.email] }],
    password: [
      '',
      { validators: [Validators.required, Validators.minLength(8)] },
    ],
  });

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.errorMsg = '';

    this.auth.register(this.form.getRawValue()).subscribe({
      next: () => {
        this.router.navigate(['/login'], { queryParams: { registered: true } });
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading = false;
        this.errorMsg = err.error?.message ?? 'Registration failed. Try again.';
      },
    });
  }
}