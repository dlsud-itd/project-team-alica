import { UserRole } from '../core/auth/auth.models';
import { NavItem } from '../shared/bottom-nav/bottom-nav.component';

// Account creation is reachable from the sign-in page.
export const GUEST_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Sign in', path: '/login' },
];

export const ATTENDEE_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'History', path: '/attendee/history' },
  { label: 'Profile', path: '/profile' },
];

export const STAFF_GUEST_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Operator Login', path: '/staff/login' },
];

export const STAFF_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Scanner', path: '/staff/scanner' },
  { label: 'Profile', path: '/profile' },
];

export const ORGANIZER_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Dashboard', path: '/organizer/dashboard' },
  { label: 'Profile', path: '/profile' },
];

// The admin console itself is desktop-only with no floating nav; this is only
// shown on shared pages (events, profile) so admins can get back to it.
export const ADMIN_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Admin Console', path: '/admin/dashboard' },
  { label: 'Profile', path: '/profile' },
];

const ROLE_NAV: Record<UserRole, NavItem[]> = {
  ADMIN: ADMIN_NAV,
  ORGANIZER: ORGANIZER_NAV,
  STAFF: STAFF_NAV,
  ATTENDEE: ATTENDEE_NAV,
};

/** Floating nav for the given role, or the guest nav when signed out. */
export function navForRole(role: UserRole | undefined, guestNav = GUEST_NAV): NavItem[] {
  return role ? ROLE_NAV[role] : guestNav;
}
