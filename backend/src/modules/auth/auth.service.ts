import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export class LoginDto {
  email!: string;
  password!: string;
}

export class RegisterDto {
  fullName!: string;
  email!: string;
  password!: string;
  studentId?: string;
  affiliation?: string;
}

export class ChangePasswordDto {
  currentPassword!: string;
  newPassword!: string;
}

export interface SavedProfileDto {
  id: string;
  profileName: string;
  fullName: string;
  studentId: string | null;
  contactNumber: string | null;
  affiliation: string | null;
  isDefault: boolean;
  createdAt: string;
}

export class CreateSavedProfileDto {
  profileName!: string;
  fullName!: string;
  studentId?: string;
  contactNumber?: string;
  affiliation?: string;
  isDefault?: boolean;
}

export interface UserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string | null;
  affiliation?: string | null;
  mustChangePassword?: boolean;
}

export interface AuthResponseDto {
  user: UserSummaryDto;
  token: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret =
    process.env.JWT_SECRET || 'checkpoint-secret-key-2026';

  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    if (!dto.email || !dto.password) {
      throw new BadRequestException('Email and password are required');
    }

    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        studentId: user.studentId,
        affiliation: user.affiliation,
        mustChangePassword: user.mustChangePassword,
      },
      token,
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (!dto.email || !dto.fullName || !dto.password) {
      throw new BadRequestException(
        'Full name, email, and password are required',
      );
    }

    if (dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: dto.fullName.trim(),
        role: UserRole.USER,
        studentId: dto.studentId?.trim() || null,
        affiliation: dto.affiliation?.trim() || 'Attendee',
        isActive: true,
        mustChangePassword: false,
      },
    });

    const token = this.generateToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        studentId: user.studentId,
        affiliation: user.affiliation,
        mustChangePassword: false,
      },
      token,
    };
  }

  async getMe(tokenOrAuthHeader: string): Promise<UserSummaryDto> {
    const token = tokenOrAuthHeader.startsWith('Bearer ')
      ? tokenOrAuthHeader.slice(7)
      : tokenOrAuthHeader;

    try {
      const decoded = jwt.verify(token, this.jwtSecret) as {
        sub: string;
        email: string;
        role: UserRole;
      };

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account not found or inactive');
      }

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        studentId: user.studentId,
        affiliation: user.affiliation,
        mustChangePassword: user.mustChangePassword,
      };
    } catch {
      throw new UnauthorizedException(
        'Invalid or expired authentication token',
      );
    }
  }

  async changePassword(
    user: UserSummaryDto,
    dto: ChangePasswordDto,
  ): Promise<UserSummaryDto> {
    if (!dto.currentPassword || !dto.newPassword) {
      throw new BadRequestException(
        'Current password and new password are required',
      );
    }
    if (dto.newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters long',
      );
    }

    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
    });
    if (!account || !account.isActive) {
      throw new UnauthorizedException('User account not found or inactive');
    }
    if (!(await bcrypt.compare(dto.currentPassword, account.passwordHash))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.prisma.user.update({
      where: { id: account.id },
      data: {
        passwordHash: await bcrypt.hash(dto.newPassword, 10),
        mustChangePassword: false,
      },
    });

    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      role: account.role,
      studentId: account.studentId,
      affiliation: account.affiliation,
      mustChangePassword: false,
    };
  }

  async getSavedProfiles(user: UserSummaryDto): Promise<SavedProfileDto[]> {
    const profiles = await this.prisma.savedProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return profiles.map((p) => ({
      id: p.id,
      profileName: p.profileName,
      fullName: p.fullName,
      studentId: p.studentId,
      contactNumber: p.contactNumber,
      affiliation: p.affiliation,
      isDefault: p.isDefault,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async createSavedProfile(
    user: UserSummaryDto,
    dto: CreateSavedProfileDto,
  ): Promise<SavedProfileDto> {
    if (!dto.profileName?.trim() || !dto.fullName?.trim()) {
      throw new BadRequestException('Profile name and full name are required');
    }

    if (dto.isDefault) {
      await this.prisma.savedProfile.updateMany({
        where: { userId: user.id },
        data: { isDefault: false },
      });
    }

    const created = await this.prisma.savedProfile.create({
      data: {
        userId: user.id,
        profileName: dto.profileName.trim(),
        fullName: dto.fullName.trim(),
        studentId: dto.studentId?.trim() || null,
        contactNumber: dto.contactNumber?.trim() || null,
        affiliation: dto.affiliation?.trim() || null,
        isDefault: dto.isDefault ?? false,
      },
    });

    return {
      id: created.id,
      profileName: created.profileName,
      fullName: created.fullName,
      studentId: created.studentId,
      contactNumber: created.contactNumber,
      affiliation: created.affiliation,
      isDefault: created.isDefault,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async deleteSavedProfile(
    user: UserSummaryDto,
    profileId: string,
  ): Promise<void> {
    await this.prisma.savedProfile.deleteMany({
      where: { id: profileId, userId: user.id },
    });
  }

  private generateToken(userId: string, email: string, role: string): string {
    return jwt.sign(
      {
        sub: userId,
        email,
        role,
      },
      this.jwtSecret,
      { expiresIn: '7d' },
    );
  }
}
