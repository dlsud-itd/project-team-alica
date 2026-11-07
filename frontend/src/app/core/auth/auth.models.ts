// Mirrors the `user_role` enum on the `users` table.
export type UserRole = 'ADMIN' | 'USER' | 'ORGANIZER' | 'STAFF' | 'ATTENDEE';

export interface SavedProfile {
  id: string;
  profileName: string;
  fullName: string;
  studentId: string | null;
  contactNumber: string | null;
  affiliation: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string | null;
  affiliation?: string | null;
  mustChangePassword?: boolean;
}

// Landing page for each role after login, or when hitting a page the role can't access.
export const ROLE_HOME: Record<UserRole, string> = {
  ADMIN: '/admin/dashboard',
  USER: '/hub',
  ORGANIZER: '/hub',
  STAFF: '/hub',
  ATTENDEE: '/hub',
};
