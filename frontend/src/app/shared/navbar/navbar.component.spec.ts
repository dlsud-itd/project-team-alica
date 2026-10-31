import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NavbarComponent } from './navbar.component';
import { AuthService } from '../../core/auth/auth.service';

describe('NavbarComponent', () => {
  let component: NavbarComponent;
  let fixture: ComponentFixture<NavbarComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [NavbarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    authService.logout(null);

    fixture = TestBed.createComponent(NavbarComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    authService.logout(null);
    localStorage.clear();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders sign in and register buttons for unauthenticated guests', () => {
    const el = fixture.nativeElement as HTMLElement;
    const signIn = el.querySelector('.btn-auth-link');
    const register = el.querySelector('.btn-auth-primary');

    expect(signIn).toBeTruthy();
    expect(register).toBeTruthy();
  });

  it('renders user profile and quick logout when authenticated', async () => {
    authService.setSession(
      {
        id: '1',
        email: 'organizer@alica.ph',
        fullName: 'Campus Organizer',
        role: 'ORGANIZER',
      },
      'fake-token',
    );
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const userPill = el.querySelector('.user-pill');
    const logoutBtn = el.querySelector('.btn-quick-logout');
    const dashboardLink = el.querySelector('.desktop-nav a[href="/organizer/dashboard"]');

    expect(userPill).toBeTruthy();
    expect(logoutBtn).toBeTruthy();
    expect(dashboardLink).toBeTruthy();
  });
});
