import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { UserProfileComponent } from './user_profile.component';
import { UserProfileService } from './user_profile.service';
import {
  UserProfile,
  UserRole,
  ProfileStatus,
} from './user_profile.model';

describe('UserProfileComponent', () => {
  let component: UserProfileComponent;
  let fixture: ComponentFixture<UserProfileComponent>;
  let mockUserProfileService: {
    getProfile: ReturnType<typeof vi.fn>;
    generateQrCode: ReturnType<typeof vi.fn>;
    saveProfile: ReturnType<typeof vi.fn>;
  };
  let mockRouter: {
    navigate: ReturnType<typeof vi.fn>;
  };

  const mockProfile: UserProfile = {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    ticketCode: 'CHK-2026-9812A',
    fullName: 'Alen Mikel Umandal',
    firstName: 'Alen Mikel',
    lastName: 'Umandal',
    email: 'amc.umandal@gmail.com',
    phoneNumber: '+63 917 123 4567',
    role: UserRole.ATTENDEE,
    status: ProfileStatus.ACTIVE,
    issuedAt: '2026-10-23T10:00:00.000Z',
    qrPayload: 'CHK-2026-9812A',
  };

  beforeEach(async () => {
    mockUserProfileService = {
      getProfile: vi.fn().mockReturnValue(of(mockProfile)),
      generateQrCode: vi.fn().mockReturnValue(of('data:image/png;base64,mockQrCode')),
      saveProfile: vi.fn().mockReturnValue(of(mockProfile)),
    };
    mockRouter = {
      navigate: vi.fn().mockReturnValue(Promise.resolve(true)),
    };

    await TestBed.configureTestingModule({
      imports: [UserProfileComponent],
      providers: [
        {
          provide: UserProfileService,
          useValue: mockUserProfileService,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ ticketCode: 'CHK-2026-9812A' })),
          },
        },
        {
          provide: Router,
          useValue: mockRouter,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserProfileComponent);
    component = fixture.componentInstance;
  });

  it('should create the user profile component', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load user profile and generate QR code on init', () => {
    fixture.detectChanges();

    expect(mockUserProfileService.getProfile).toHaveBeenCalledWith(
      'CHK-2026-9812A'
    );
    expect(mockUserProfileService.generateQrCode).toHaveBeenCalledWith(
      'CHK-2026-9812A'
    );
    expect(component.userProfile).toEqual(mockProfile);
    expect(component.qrDataUrl).toBe('data:image/png;base64,mockQrCode');
    expect(component.isLoading).toBe(false);
  });

  it('should NOT render ATTENDEE role badge for standard accounts', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(component.shouldShowRoleBadge()).toBe(false);
    expect(compiled.querySelector('#hero_role_badge')).toBeNull();
  });

  it('should render role badge for organizer or staff accounts', () => {
    mockUserProfileService.getProfile.mockReturnValue(
      of({
        ...mockProfile,
        role: UserRole.ORGANIZER,
      })
    );
    component.loadUserProfile();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(component.shouldShowRoleBadge()).toBe(true);
    const badge = compiled.querySelector('#hero_role_badge');
    expect(badge?.textContent?.trim()).toBe('ORGANIZER');
  });

  it('should render email in hero subtext and not render student/employee ID', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    const subtext = compiled.querySelector('#user_subtext_info');
    expect(subtext?.textContent?.trim()).toBe('amc.umandal@gmail.com');
    expect(compiled.querySelector('#info_id_number')).toBeNull();
  });

  it('should split full name into first and last name when editing and recombine on save', () => {
    fixture.detectChanges();

    component.toggleEdit();
    expect(component.isEditing).toBe(true);
    expect(component.editFirstName).toBe('Alen Mikel');
    expect(component.editLastName).toBe('Umandal');

    component.editFirstName = 'Alexander';
    component.editLastName = 'Smith';
    component.saveProfileChanges();

    expect(component.userProfile?.fullName).toBe('Alexander Smith');
    expect(component.isEditing).toBe(false);
  });

  it('should trigger QR download when downloadQrCode is called', () => {
    fixture.detectChanges();
    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = origCreateElement(tagName);
      if (tagName === 'a') {
        el.click = clickSpy;
      }
      return el;
    });

    component.downloadQrCode();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should trigger showSaveFilePicker if available', () => {
    fixture.detectChanges();
    const createWritableSpy = vi.fn().mockReturnValue(
      Promise.resolve({
        write: vi.fn().mockReturnValue(Promise.resolve()),
        close: vi.fn().mockReturnValue(Promise.resolve()),
      })
    );
    const showSaveFilePickerSpy = vi.fn().mockReturnValue(
      Promise.resolve({
        createWritable: createWritableSpy,
      })
    );

    (window as unknown as { showSaveFilePicker: typeof showSaveFilePickerSpy }).showSaveFilePicker =
      showSaveFilePickerSpy;

    component.downloadQrCode();
    expect(showSaveFilePickerSpy).toHaveBeenCalled();

    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });

  it('should handle profile loading error gracefully', () => {
    mockUserProfileService.getProfile.mockReturnValue(
      throwError(() => new Error('Network error'))
    );

    component.loadUserProfile();
    fixture.detectChanges();

    expect(component.errorMessage).toBe(
      'Failed to load user profile and QR code.'
    );
    expect(component.isLoading).toBe(false);
  });

  describe('Change Password & Sign Out', () => {
    it('should open and close the change password dialog', () => {
      fixture.detectChanges();

      component.openChangePassword();
      expect(component.isChangePasswordOpen).toBe(true);
      expect(component.currentPassword).toBe('');
      expect(component.newPassword).toBe('');
      expect(component.confirmPassword).toBe('');

      component.closeChangePassword();
      expect(component.isChangePasswordOpen).toBe(false);
    });

    it('should validate empty fields when submitting change password', () => {
      fixture.detectChanges();
      component.openChangePassword();

      component.currentPassword = '';
      component.newPassword = '';
      component.confirmPassword = '';
      component.submitChangePassword();

      expect(component.passwordError).toBe('Please fill in all password fields.');
      expect(component.passwordSuccess).toBe('');
    });

    it('should validate minimum password length', () => {
      fixture.detectChanges();
      component.openChangePassword();

      component.currentPassword = 'oldpassword123';
      component.newPassword = 'abc';
      component.confirmPassword = 'abc';
      component.submitChangePassword();

      expect(component.passwordError).toBe('New password must be at least 6 characters long.');
    });

    it('should validate password mismatch', () => {
      fixture.detectChanges();
      component.openChangePassword();

      component.currentPassword = 'oldpassword123';
      component.newPassword = 'newpassword123';
      component.confirmPassword = 'differentpassword';
      component.submitChangePassword();

      expect(component.passwordError).toBe('New passwords do not match.');
    });

    it('should succeed when valid passwords are provided', () => {
      fixture.detectChanges();
      component.openChangePassword();

      component.currentPassword = 'oldpassword123';
      component.newPassword = 'newpassword123';
      component.confirmPassword = 'newpassword123';
      component.submitChangePassword();

      expect(component.passwordError).toBe('');
      expect(component.passwordSuccess).toBe('Password updated successfully!');
    });

    it('should clear storage and navigate to root on signOut', () => {
      const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem');
      const clearSpy = vi.spyOn(Storage.prototype, 'clear');

      component.signOut();

      expect(removeItemSpy).toHaveBeenCalledWith('checkpoint_user');
      expect(removeItemSpy).toHaveBeenCalledWith('registered_attendee');
      expect(clearSpy).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
    });
  });
});

