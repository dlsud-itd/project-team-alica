import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { UserRole } from './auth.models';
import { AuthService } from './auth.service';

/**
 * Allows the route only for the given roles.
 * - Not logged in: redirect to `loginUrl` with a `returnUrl` query param.
 * - Logged in with the wrong role: redirect to that role's home page.
 */
export function roleGuard(roles: UserRole[], loginUrl = '/login'): CanMatchFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      // Full target URL; canMatch segments are only relative to the parent route.
      const returnUrl = router.currentNavigation()?.extractedUrl.toString();
      return router.createUrlTree([loginUrl], { queryParams: { returnUrl } });
    }
    if (auth.user()?.mustChangePassword) {
      return router.parseUrl('/change-password');
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
  if (!auth.isAuthenticated()) return true;
  const router = inject(Router);
  return router.parseUrl(
    auth.user()?.mustChangePassword ? '/change-password' : auth.homeUrl(),
  );
};

export const passwordChangeGuard: CanMatchFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: '/change-password' },
    });
  }
  return auth.user()?.mustChangePassword
    ? true
    : router.parseUrl(auth.homeUrl());
};

/** Allows public ticket-code profile links, but protects the signed-in profile. */
export const profileAccessGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.user()?.mustChangePassword) {
    return router.parseUrl('/change-password');
  }
  if (!state.url.startsWith('/profile/')) {
    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login'], {
        queryParams: { returnUrl: state.url },
      });
    }
  }
  return true;
};
