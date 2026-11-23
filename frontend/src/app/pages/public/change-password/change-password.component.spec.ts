import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ChangePasswordComponent } from './change-password.component';

describe('ChangePasswordComponent', () => {
  let fixture: ComponentFixture<ChangePasswordComponent>;
  let component: ChangePasswordComponent;
  let authService: { changePassword: ReturnType<typeof vi.fn> };
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    authService = {
      changePassword: vi.fn().mockReturnValue(
        of({
          id: 'guest-1',
          email: 'guest@example.org',
          fullName: 'Alex Guest',
          role: 'ATTENDEE',
          mustChangePassword: false,
        }),
      ),
    };
    router = { navigateByUrl: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordComponent);
    component = fixture.componentInstance;
  });

  it('should reject a password shorter than eight characters', () => {
    component.currentPassword = 'temporary';
    component.newPassword = 'short';
    component.confirmPassword = 'short';

    component.submit();

    expect(authService.changePassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('at least 8 characters');
  });

  it('should update the password and navigate attendees to their profile', () => {
    component.currentPassword = 'temporary';
    component.newPassword = 'new-secure-password';
    component.confirmPassword = 'new-secure-password';

    component.submit();

    expect(authService.changePassword).toHaveBeenCalledWith(
      'temporary',
      'new-secure-password',
    );
    expect(router.navigateByUrl).toHaveBeenCalledWith('/profile');
  });

  it('should display an API error without navigating', () => {
    authService.changePassword.mockReturnValue(
      throwError(() => ({
        error: { message: 'Current password is incorrect' },
      })),
    );
    component.currentPassword = 'wrong';
    component.newPassword = 'new-secure-password';
    component.confirmPassword = 'new-secure-password';

    component.submit();

    expect(component.errorMessage()).toBe('Current password is incorrect');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
