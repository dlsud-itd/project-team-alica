import { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'events' },

  // Public
  {
    path: 'events',
    loadComponent: () =>
      import('./pages/public/events/events.component').then((m) => m.Events),
  },
  {
    path: 'login',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./pages/public/login/login.component').then((m) => m.Login),
  },
  {
    path: 'register',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./pages/public/register/register.component').then(
        (m) => m.Register,
      ),
  },
  {
    path: 'staff/login',
    canMatch: [guestGuard],
    loadComponent: () =>
      import('./pages/staff/operator-login/operator-login.component').then(
        (m) => m.OperatorLogin,
      ),
  },

  // ADMIN
  {
    path: 'admin',
    canMatch: [roleGuard(['ADMIN'])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/admin/dashboard/dashboard.component').then(
            (m) => m.AdminDashboard,
          ),
      },
    ],
  },

  // ORGANIZER
  {
    path: 'organizer',
    canMatch: [roleGuard(['ORGANIZER'])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/organizer/dashboard/dashboard.component').then(
            (m) => m.OrganizerDashboard,
          ),
      },
    ],
  },

  // STAFF (unauthenticated staff are sent to the operator login)
  {
    path: 'staff',
    canMatch: [roleGuard(['STAFF'], '/staff/login')],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'scanner' },
      {
        path: 'scanner',
        loadComponent: () =>
          import('./pages/staff/scanner/scanner.component').then(
            (m) => m.Scanner,
          ),
      },
    ],
  },

  // ATTENDEE
  {
    path: 'attendee',
    canMatch: [roleGuard(['ATTENDEE'])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/attendee/profile/profile.component').then(
            (m) => m.Profile,
          ),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/attendee/history/history.component').then(
            (m) => m.History,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'events' },
];
