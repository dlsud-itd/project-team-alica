import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { AuthUser, UserRole } from './auth.models';
import { AuthService } from './auth.service';

function userWith(role: UserRole): AuthUser {
  return { id: '1', email: 'a@b.c', fullName: 'Test User', role };
}

describe('role-based routing', () => {
  let router: Router;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    router = TestBed.inject(Router);
    auth = TestBed.inject(AuthService);
  });

  it('sends guests to login with a returnUrl', async () => {
    await router.navigateByUrl('/admin/dashboard');
    expect(router.url).toBe('/login?returnUrl=%2Fadmin%2Fdashboard');
  });

  it('sends guest staff routes to the operator login', async () => {
    await router.navigateByUrl('/staff/scanner');
    expect(router.url).toBe('/staff/login?returnUrl=%2Fstaff%2Fscanner');
  });

  it('allows a user into their own role area', async () => {
    auth.setSession(userWith('ORGANIZER'), 'token');
    await router.navigateByUrl('/organizer/dashboard');
    expect(router.url).toBe('/organizer/dashboard');
  });

  it('redirects a user away from another role area to their home', async () => {
    auth.setSession(userWith('ATTENDEE'), 'token');
    await router.navigateByUrl('/admin/dashboard');
    expect(router.url).toBe('/events');
  });

  it('keeps logged-in users off the login page', async () => {
    auth.setSession(userWith('STAFF'), 'token');
    await router.navigateByUrl('/login');
    expect(router.url).toBe('/staff/scanner');
  });

  it('keeps the full returnUrl for nested staff routes', async () => {
    await router.navigateByUrl('/staff/profile');
    expect(router.url).toBe('/staff/login?returnUrl=%2Fstaff%2Fprofile');
  });

  it('lets staff and organizers open their own profile', async () => {
    auth.setSession(userWith('STAFF'), 'token');
    await router.navigateByUrl('/staff/profile');
    expect(router.url).toBe('/staff/profile');

    auth.setSession(userWith('ORGANIZER'), 'token');
    await router.navigateByUrl('/organizer/profile');
    expect(router.url).toBe('/organizer/profile');
  });
});
