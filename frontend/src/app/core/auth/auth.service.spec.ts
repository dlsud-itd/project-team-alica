import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { AuthUser } from './auth.models';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should post registration payload', () => {
    const payload = {
      fullName: 'Juan Dela Cruz',
      email: 'juan@example.com',
      password: 'password123',
    };

    service.register(payload).subscribe((res) => {
      expect(res).toBeTruthy();
    });

    const req = httpMock.expectOne(`${service['api']}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({ success: true });
  });

  it('should post login payload', () => {
    const payload = {
      email: 'amc.umandal@gmail.com',
      password: 'SecurePassword123!',
    };

    service.login(payload).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.data.token).toBe('token-xyz');
    });

    const req = httpMock.expectOne(`${service['api']}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      success: true,
      data: {
        user: {
          id: 'usr-attendee-alen',
          email: 'amc.umandal@gmail.com',
          fullName: 'Alen Mikel Umandal',
          role: 'ATTENDEE',
        },
        token: 'token-xyz',
      },
    });
  });

  it('should clear session and storage on logout', () => {
    const user: AuthUser = {
      id: 'usr-1',
      email: 'user@example.com',
      fullName: 'Test User',
      role: 'ATTENDEE',
    };
    service.setSession(user, 'token-123');
    expect(service.isAuthenticated()).toBe(true);

    service.logout(null);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });
});
