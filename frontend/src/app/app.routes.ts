import { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'events' },

  // Public
  {
    path: '',
    loadComponent: () =>
      import('./layouts/public-layout/public-layout.component').then((m) => m.PublicLayout),
    children: [
      {
        path: 'events',
        loadComponent: () => import('./pages/public/events/events.component').then((m) => m.Events),
      },
      {
        path: 'login',
        canMatch: [guestGuard],
        loadComponent: () => import('./pages/public/login/login.component').then((m) => m.Login),
      },
      {
        path: 'register',
        canMatch: [guestGuard],
        loadComponent: () =>
          import('./pages/public/register/register.component').then((m) => m.RegisterComponent),
      },
    ],
  },

  // ADMIN
  {
    path: 'admin',
    canMatch: [roleGuard(['ADMIN'])],
    loadComponent: () =>
      import('./layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin/dashboard/dashboard.component').then((m) => m.AdminDashboard),
      },
    ],
  },

  // ORGANIZER
  {
    path: 'organizer',
    canMatch: [roleGuard(['ORGANIZER'])],
    loadComponent: () =>
      import('./layouts/organizer-layout/organizer-layout.component').then(
        (m) => m.OrganizerLayout,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/organizer/dashboard/dashboard.component').then(
            (m) => m.OrganizerDashboard,
          ),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/attendee/profile/profile.component').then((m) => m.Profile),
      },
    ],
  },

  // STAFF
  {
    path: 'staff',
    loadComponent: () =>
      import('./layouts/staff-layout/staff-layout.component').then((m) => m.StaffLayout),
    children: [
      {
        path: 'login',
        canMatch: [guestGuard],
        loadComponent: () =>
          import('./pages/staff/operator-login/operator-login.component').then(
            (m) => m.OperatorLogin,
          ),
      },
      // Unauthenticated staff are sent to the operator login.
      {
        path: '',
        canMatch: [roleGuard(['STAFF'], '/staff/login')],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'scanner' },
          {
            path: 'scanner',
            loadComponent: () =>
              import('./pages/staff/scanner/scanner.component').then((m) => m.Scanner),
          },
          {
            path: 'profile',
            loadComponent: () =>
              import('./pages/attendee/profile/profile.component').then((m) => m.Profile),
          },
        ],
      },
    ],
  },

  // ATTENDEE
  {
    path: 'attendee',
    canMatch: [roleGuard(['ATTENDEE'])],
    loadComponent: () =>
      import('./layouts/attendee-layout/attendee-layout.component').then((m) => m.AttendeeLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/attendee/profile/profile.component').then((m) => m.Profile),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/attendee/history/history.component').then((m) => m.History),
      },
    ],
  },

  { path: '**', redirectTo: 'events' },
];
