import { NavItem } from '../shared/bottom-nav/bottom-nav.component';

// Not logged in: Profile leads to login/register.
export const GUEST_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Profile', path: '/login' },
];

export const ATTENDEE_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'History', path: '/attendee/history' },
  { label: 'Profile', path: '/attendee/profile' },
];

export const STAFF_GUEST_NAV: NavItem[] = [
  { label: 'Operator Login', path: '/staff/login' },
  { label: 'Profile', path: '/staff/profile' },
];

export const STAFF_NAV: NavItem[] = [
  { label: 'Scanner', path: '/staff/scanner' },
  { label: 'Profile', path: '/staff/profile' },
];

export const ORGANIZER_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/organizer/dashboard' },
  { label: 'Profile', path: '/organizer/profile' },
];

// Admin is desktop-only and has no bottom nav.
