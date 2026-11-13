import { Routes } from '@angular/router';
import {
  authGuard,
  guestGuard,
  passwordChangeGuard,
  profileAccessGuard,
  roleGuard,
} from './core/auth/auth.guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'events' },

  // Public & Authenticated Shared Views
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
        path: 'hub',
        canActivate: [authGuard],
        loadComponent: () => import('./pages/hub/hub.component').then((m) => m.HubComponent),
      },
      {
        path: 'profile',
        canActivate: [profileAccessGuard],
        loadComponent: () =>
          import('./user_profile/user_profile.component').then((m) => m.UserProfileComponent),
      },
      {
        path: 'profile/:ticketCode',
        canActivate: [profileAccessGuard],
        loadComponent: () =>
          import('./user_profile/user_profile.component').then((m) => m.UserProfileComponent),
      },
    ],
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
  {
    path: 'change-password',
    canMatch: [passwordChangeGuard],
    loadComponent: () =>
      import('./pages/public/change-password/change-password.component').then(
        (m) => m.ChangePasswordComponent,
      ),
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
    canMatch: [authGuard],
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
        path: 'events/:eventId',
        loadComponent: () =>
          import('./pages/organizer/event-shell/event-shell.component').then(
            (m) => m.EventShellComponent,
          ),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            loadComponent: () =>
              import('./pages/organizer/event-overview/event-overview.component').then(
                (m) => m.EventOverviewComponent,
              ),
          },
          {
            path: 'scanner',
            loadComponent: () =>
              import('./pages/organizer/event-scanner/event-scanner.component').then(
                (m) => m.EventScannerComponent,
              ),
          },
          {
            path: 'scanner/:boothId',
            loadComponent: () =>
              import('./pages/organizer/event-scanner/event-scanner.component').then(
                (m) => m.EventScannerComponent,
              ),
          },
          {
            path: 'guests',
            loadComponent: () =>
              import('./pages/organizer/registrants/registrants.component').then(
                (m) => m.OrganizerRegistrants,
              ),
          },
        ],
      },
      {
        path: 'events/:eventId/registrants',
        redirectTo: 'events/:eventId/guests',
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
        path: '',
        canMatch: [authGuard],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'scanner' },
          {
            path: 'scanner',
            loadComponent: () =>
              import('./pages/staff/scanner/scanner.component').then((m) => m.Scanner),
          },
          {
            path: 'scanner/:boothId',
            loadComponent: () =>
              import('./pages/staff/scanner/scanner.component').then((m) => m.Scanner),
          },
          {
            path: 'events/:eventId',
            loadComponent: () =>
              import('./pages/organizer/event-shell/event-shell.component').then(
                (m) => m.EventShellComponent,
              ),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'scanner' },
              {
                path: 'overview',
                loadComponent: () =>
                  import('./pages/organizer/event-overview/event-overview.component').then(
                    (m) => m.EventOverviewComponent,
                  ),
              },
              {
                path: 'scanner',
                loadComponent: () =>
                  import('./pages/organizer/event-scanner/event-scanner.component').then(
                    (m) => m.EventScannerComponent,
                  ),
              },
              {
                path: 'scanner/:boothId',
                loadComponent: () =>
                  import('./pages/organizer/event-scanner/event-scanner.component').then(
                    (m) => m.EventScannerComponent,
                  ),
              },
              {
                path: 'guests',
                loadComponent: () =>
                  import('./pages/organizer/registrants/registrants.component').then(
                    (m) => m.OrganizerRegistrants,
                  ),
              },
            ],
          },
        ],
      },
    ],
  },

  // ATTENDEE (Redirect to Hub)
  { path: 'attendee', redirectTo: 'hub' },
  { path: 'attendee/history', redirectTo: 'hub' },

  { path: '**', redirectTo: 'events' },
];
