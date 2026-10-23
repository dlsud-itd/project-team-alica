import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create the register component', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form initially', () => {
    expect(component.form.valid).toBe(false);
  });

  it('should toggle password visibility', () => {
    expect(component.showPassword).toBe(false);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(true);
    component.togglePasswordVisibility();
    expect(component.showPassword).toBe(false);
  });

  it('should register and redirect on successful submit', () => {
    vi.spyOn(authService, 'register').mockReturnValue(of({ success: true }));

    component.form.patchValue({
      fullName: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith({
      fullName: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
    });
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { registered: true },
    });
  });

  it('should display error message on failed registration', () => {
    vi.spyOn(authService, 'register').mockReturnValue(
      throwError(() => ({ error: { message: 'Email already exists' } })),
    );

    component.form.patchValue({
      fullName: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
    });

    component.onSubmit();

    expect(component.loading).toBe(false);
    expect(component.errorMsg).toBe('Email already exists');
  });
});
