import { Routes } from '@angular/router';
import { RegisterComponent } from './pages/public/register/register.component';
import { Login } from './pages/public/login/login.component';

export const routes: Routes = [
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'register',
    component: RegisterComponent,
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
