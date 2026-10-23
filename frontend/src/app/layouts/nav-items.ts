import { NavItem } from '../shared/bottom-nav/bottom-nav.component';

// Guests can view the shared profile page and choose to log in from there.
export const GUEST_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'Profile', path: '/profile' },
];

export const ATTENDEE_NAV: NavItem[] = [
  { label: 'Events', path: '/events' },
  { label: 'History', path: '/attendee/history' },
  { label: 'Profile', path: '/profile' },
];

export const STAFF_GUEST_NAV: NavItem[] = [
  { label: 'Operator Login', path: '/staff/login' },
  { label: 'Profile', path: '/profile' },
];

export const STAFF_NAV: NavItem[] = [
  { label: 'Scanner', path: '/staff/scanner' },
  { label: 'Profile', path: '/profile' },
];

export const ORGANIZER_NAV: NavItem[] = [
  { label: 'Dashboard', path: '/organizer/dashboard' },
  { label: 'Profile', path: '/profile' },
];

// Admin is desktop-only and has no bottom nav.
