// Mirrors the `user_role` enum on the `users` table.
export type UserRole = 'ADMIN' | 'ORGANIZER' | 'STAFF' | 'ATTENDEE';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string | null;
  affiliation?: string | null;
}

// Landing page for each role after login, or when hitting a page the role can't access.
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: '/admin/dashboard',
  ORGANIZER: '/events',
  STAFF: '/staff/scanner',
  ATTENDEE: '/events',
};
