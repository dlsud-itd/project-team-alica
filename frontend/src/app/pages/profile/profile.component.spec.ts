import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Profile } from './profile.component';

describe('Profile', () => {
  let component: Profile;
  let fixture: ComponentFixture<Profile>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Profile],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Profile);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows a login prompt to guests', () => {
    expect(fixture.nativeElement.textContent).toContain('You’re not signed in yet.');
    expect(fixture.nativeElement.querySelector('a[routerLink="/login"]')).toBeTruthy();
  });

  it('shows account details to signed-in users', () => {
    TestBed.inject(AuthService).setSession(
      { id: '1', email: 'person@example.com', fullName: 'Test User', role: 'ATTENDEE' },
      'token',
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome, Test User');
    expect(fixture.nativeElement.textContent).toContain('person@example.com');
  });
});
