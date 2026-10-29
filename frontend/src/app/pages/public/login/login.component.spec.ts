import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Login } from './login.component';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create the login component', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form initially', () => {
    expect(component.loginForm.valid).toBe(false);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(false);
  });

  it('should display error when submitting invalid credentials', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      throwError(() => ({
        error: { message: 'Invalid email or password' },
      })),
    );

    component.loginForm.patchValue({
      email: 'organizer@example.com',
      password: 'WrongPassword999!',
    });

    component.onSubmit();
    expect(component.errorMessage).toBe('Invalid email or password');
    expect(component.loginForm.controls.password.value).toBe('');
  });

  it('should succeed when submitting valid credentials', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      of({
        success: true,
        data: {
          user: {
            id: 'usr-organizer-campus',
            email: 'organizer@example.com',
            fullName: 'Campus Organizer',
            role: 'ORGANIZER',
          },
          token: 'jwt-token-xyz',
        },
      }),
    );

    component.loginForm.patchValue({
      email: 'organizer@example.com',
      password: 'SecurePassword123!',
    });

    component.onSubmit();
    expect(component.successMessage).toContain('Authentication successful');
    expect(router.navigate).toHaveBeenCalled();
  });

  it('should accept any valid role credentials in the single unified login', () => {
    vi.spyOn(authService, 'login').mockReturnValue(
      of({
        success: true,
        data: {
          user: {
            id: 'usr-staff-station',
            email: 'staff@checkpoint.ph',
            fullName: 'Station Operator',
            role: 'STAFF',
          },
          token: 'jwt-token-staff',
        },
      }),
    );

    component.loginForm.patchValue({
      email: 'staff@checkpoint.ph',
      password: 'SecurePassword123!',
    });

    component.onSubmit();
    expect(component.successMessage).toContain('Authentication successful');
    expect(router.navigate).toHaveBeenCalled();
  });
});
