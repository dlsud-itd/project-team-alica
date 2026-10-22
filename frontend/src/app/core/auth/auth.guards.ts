import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { UserRole } from './auth.models';
import { AuthService } from './auth.service';

/**
 * Allows the route only for the given roles.
 * - Not logged in: redirect to `loginUrl` with a `returnUrl` query param.
 * - Logged in with the wrong role: redirect to that role's home page.
 */
export function roleGuard(
  roles: UserRole[],
  loginUrl = '/login',
): CanMatchFn {
  return (_route, segments) => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      const returnUrl = '/' + segments.map((s) => s.path).join('/');
      return router.createUrlTree([loginUrl], { queryParams: { returnUrl } });
    }
    if (auth.hasRole(...roles)) {
      return true;
    }
    return router.parseUrl(auth.homeUrl());
  };
}

/** Keeps logged-in users off the login/register pages. */
export const guestGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  return auth.isAuthenticated()
    ? inject(Router).parseUrl(auth.homeUrl())
    : true;
};
