// Mirrors the `user_role` enum on the `users` table.
export type UserRole = 'ADMIN' | 'ORGANIZER' | 'STAFF' | 'ATTENDEE';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

// Landing page for each role after login, or when hitting a page the role can't access.
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: '/admin/dashboard',
  ORGANIZER: '/organizer/dashboard',
  STAFF: '/staff/scanner',
  ATTENDEE: '/events',
};
