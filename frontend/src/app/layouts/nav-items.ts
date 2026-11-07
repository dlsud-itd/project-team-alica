import { UserRole } from '../core/auth/auth.models';
import { NavItem } from '../shared/bottom-nav/bottom-nav.component';

// Account creation is reachable from the sign-in page.
export const GUEST_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Sign in', path: '/login' },
];

export const USER_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'My Hub', path: '/hub' },
  { label: 'Profile', path: '/profile' },
];

export const ATTENDEE_NAV: NavItem[] = USER_NAV;
export const STAFF_NAV: NavItem[] = USER_NAV;
export const ORGANIZER_NAV: NavItem[] = USER_NAV;

// Admins use the top header (shared/top-nav) instead; kept so every role has an entry.
export const ADMIN_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'My Hub', path: '/hub' },
  { label: 'Admin Console', path: '/admin/dashboard' },
  { label: 'Profile', path: '/profile' },
];

const ROLE_NAV: Record<UserRole, NavItem[]> = {
  ADMIN: ADMIN_NAV,
  USER: USER_NAV,
  ORGANIZER: USER_NAV,
  STAFF: USER_NAV,
  ATTENDEE: USER_NAV,
};

/** Floating nav for the given role, or the guest nav when signed out. */
export function navForRole(role: UserRole | undefined, guestNav = GUEST_NAV): NavItem[] {
  return role ? ROLE_NAV[role] : guestNav;
}
