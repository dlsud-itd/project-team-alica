import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Login } from './login.component';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([])],
    }).compileComponents();

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
    component.loginForm.patchValue({
      email: 'organizer@example.com',
      password: 'WrongPassword999!',
    });

    component.onSubmit();
    expect(component.errorMessage).toBe('Invalid email or password');
    expect(component.loginForm.controls.password.value).toBe('');
  });

  it('should succeed when submitting valid credentials', () => {
    component.loginForm.patchValue({
      email: 'organizer@example.com',
      password: 'SecurePassword123!',
    });

    component.onSubmit();
    expect(component.successMessage).toContain('Authentication successful');
  });

  it('should accept any valid role credentials in the single unified login', () => {
    component.loginForm.patchValue({
      email: 'staff@checkpoint.ph',
      password: 'SecurePassword123!',
    });

    component.onSubmit();
    expect(component.successMessage).toContain('Authentication successful');
  });
});
