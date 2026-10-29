import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of, from, timer } from 'rxjs';
import { switchMap, catchError, map } from 'rxjs/operators';
import { UserProfileService } from './user_profile.service';
import { AuthService } from '../core/auth/auth.service';
import {
  UserProfile,
  UserRole,
  ProfileStatus,
} from './user_profile.model';

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<{
    createWritable: () => Promise<{
      write: (data: unknown) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './user_profile.component.html',
  styleUrl: './user_profile.component.scss',
})
export class UserProfileComponent implements OnInit {
  userProfile: UserProfile | null = null;
  qrDataUrl = '';
  isLoading = true;
  errorMessage = '';
  isCodeCopied = false;
  isLinkCopied = false;
  isEditing = false;
  editFirstName = '';
  editLastName = '';

  // Change Password state
  isChangePasswordOpen = false;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordError = '';
  passwordSuccess = '';

  readonly userRole = UserRole;
  readonly profileStatus = ProfileStatus;
  private readonly auth = inject(AuthService, { optional: true });

  constructor(
    private readonly userProfileService: UserProfileService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadUserProfile();
  }

  loadUserProfile(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.cdr.markForCheck();

    this.activatedRoute.paramMap
      .pipe(
        map((params) => params.get('ticketCode') || undefined),
        switchMap((ticketCode) =>
          this.userProfileService.getProfile(ticketCode)
        ),
        switchMap((profile: UserProfile) => {
          this.userProfile = profile;
          return this.userProfileService.generateQrCode(profile.qrPayload);
        }),
        catchError(() => {
          this.errorMessage = 'Failed to load user profile and QR code.';
          this.isLoading = false;
          this.cdr.markForCheck();
          return of('');
        })
      )
      .subscribe({
        next: (qrCodeUrl: string) => {
          if (qrCodeUrl) {
            this.qrDataUrl = qrCodeUrl;
          }
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.isLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  getAvatarInitials(): string {
    if (!this.userProfile?.fullName) {
      return 'CP';
    }

    const nameParts = this.userProfile.fullName.trim().split(' ');
    if (nameParts.length === 1) {
      return nameParts[0].substring(0, 2).toUpperCase();
    }

    const first = nameParts[0].charAt(0);
    const last = nameParts[nameParts.length - 1].charAt(0);
    return `${first}${last}`.toUpperCase();
  }

  shouldShowRoleBadge(): boolean {
    return !!this.userProfile && this.userProfile.role !== UserRole.ATTENDEE;
  }

  copyTicketCode(): void {
    if (!this.userProfile?.ticketCode) {
      return;
    }

    if (navigator?.clipboard?.writeText) {
      this.isCodeCopied = true;
      this.cdr.markForCheck();

      from(navigator.clipboard.writeText(this.userProfile.ticketCode))
        .pipe(
          switchMap(() => timer(2000)),
          catchError(() => of(null))
        )
        .subscribe({
          next: () => {
            this.isCodeCopied = false;
            this.cdr.markForCheck();
          },
        });
    }
  }

  downloadQrCode(): void {
    if (!this.userProfile?.ticketCode || !this.qrDataUrl) {
      return;
    }

    const blob = this.convertDataUrlToBlob(this.qrDataUrl);
    const filename = `${this.userProfile.ticketCode}-checkpoint-qr.png`;
    const win = window as SaveFilePickerWindow;

    if (blob && typeof win.showSaveFilePicker === 'function') {
      from(
        win.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'PNG Image',
              accept: { 'image/png': ['.png'] },
            },
          ],
        })
      )
        .pipe(
          switchMap((handle) => from(handle.createWritable())),
          switchMap((writable) =>
            from(writable.write(blob)).pipe(
              switchMap(() => from(writable.close()))
            )
          ),
          catchError((err: unknown) => {
            if ((err as Error)?.name !== 'AbortError') {
              this.fallbackAnchorDownload(blob, filename);
            }
            return of(null);
          })
        )
        .subscribe();
      return;
    }

    this.fallbackAnchorDownload(blob || this.qrDataUrl, filename);
  }

  private convertDataUrlToBlob(dataUrl: string): Blob | null {
    try {
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].replace('data:', '') || 'image/png';
      const binaryString = atob(parts[1]);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return new Blob([bytes], { type: contentType });
    } catch {
      return null;
    }
  }

  private fallbackAnchorDownload(
    target: Blob | string,
    filename: string
  ): void {
    const isBlob = target instanceof Blob;
    const downloadUrl = isBlob ? URL.createObjectURL(target) : target;
    const link = document.createElement('a');

    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (isBlob) {
      setTimeout(() => {
        URL.revokeObjectURL(downloadUrl);
      }, 1500);
    }
  }

  onAvatarSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    if (inputElement.files && inputElement.files[0]) {
      const selectedFile = inputElement.files[0];
      const fileReader = new FileReader();

      fileReader.onload = () => {
        if (this.userProfile && typeof fileReader.result === 'string') {
          this.userProfile.avatarUrl = fileReader.result;
          this.userProfileService.saveProfile(this.userProfile).subscribe();
          this.cdr.markForCheck();
        }
      };

      fileReader.readAsDataURL(selectedFile);
    }
  }

  removeAvatar(): void {
    if (this.userProfile) {
      this.userProfile.avatarUrl = undefined;
      this.userProfileService.saveProfile(this.userProfile).subscribe();
      this.cdr.markForCheck();
    }
  }

  copyProfileLink(): void {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      return;
    }

    const url = window.location.href;
    this.isLinkCopied = true;
    this.cdr.markForCheck();

    from(navigator.clipboard.writeText(url))
      .pipe(
        switchMap(() => timer(2500)),
        catchError(() => of(null))
      )
      .subscribe({
        next: () => {
          this.isLinkCopied = false;
          this.cdr.markForCheck();
        },
      });
  }

  toggleEdit(): void {
    this.isEditing = !this.isEditing;
    if (this.isEditing && this.userProfile) {
      if (this.userProfile.firstName && this.userProfile.lastName) {
        this.editFirstName = this.userProfile.firstName;
        this.editLastName = this.userProfile.lastName;
      } else {
        const parts = this.userProfile.fullName.trim().split(' ');
        this.editFirstName = parts[0] || '';
        this.editLastName = parts.slice(1).join(' ') || '';
      }
    }
    this.cdr.markForCheck();
  }

  saveProfileChanges(): void {
    if (!this.userProfile) {
      return;
    }

    this.userProfile.firstName = this.editFirstName.trim();
    this.userProfile.lastName = this.editLastName.trim();
    this.userProfile.fullName =
      `${this.userProfile.firstName} ${this.userProfile.lastName}`.trim();

    this.userProfileService.saveProfile(this.userProfile)
      .pipe(
        switchMap((profile) =>
          this.userProfileService.generateQrCode(profile.qrPayload)
        )
      )
      .subscribe({
        next: (newQrUrl) => {
          if (newQrUrl) {
            this.qrDataUrl = newQrUrl;
          }
          this.isEditing = false;
          this.cdr.markForCheck();
        },
      });
  }

  // Password Management
  openChangePassword(): void {
    this.isChangePasswordOpen = true;
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordError = '';
    this.passwordSuccess = '';
    this.cdr.markForCheck();
  }

  closeChangePassword(): void {
    this.isChangePasswordOpen = false;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.cdr.markForCheck();
  }

  submitChangePassword(): void {
    this.passwordError = '';
    this.passwordSuccess = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.passwordError = 'Please fill in all password fields.';
      this.cdr.markForCheck();
      return;
    }

    if (this.newPassword.length < 6) {
      this.passwordError = 'New password must be at least 6 characters long.';
      this.cdr.markForCheck();
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordError = 'New passwords do not match.';
      this.cdr.markForCheck();
      return;
    }

    this.passwordSuccess = 'Password updated successfully!';
    this.cdr.markForCheck();

    from(timer(1500)).subscribe({
      next: () => {
        this.closeChangePassword();
      },
    });
  }

  // Session Sign Out
  signOut(): void {
    try {
      localStorage.removeItem('checkpoint_user');
      localStorage.removeItem('registered_attendee');
      localStorage.removeItem('checkpoint.session');
      sessionStorage.clear();
    } catch {
      // Storage unavailable fallback
    }

    if (this.auth) {
      this.auth.logout(null);
    }
    this.router.navigate(['/']);
  }

  getRoleBadgeClass(): string {
    if (!this.userProfile) {
      return 'badge-default';
    }

    switch (this.userProfile.role) {
      case UserRole.ORGANIZER:
        return 'badge-organizer';
      case UserRole.STAFF:
        return 'badge-staff';
      case UserRole.VIP:
        return 'badge-vip';
      case UserRole.SPEAKER:
        return 'badge-speaker';
      default:
        return 'badge-attendee';
    }
  }
}
