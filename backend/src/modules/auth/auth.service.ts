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

export interface UserSummaryDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  studentId?: string | null;
  affiliation?: string | null;
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
      },
      token,
    };
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    if (!dto.email || !dto.fullName || !dto.password) {
      throw new BadRequestException('Full name, email, and password are required');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
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
        role: UserRole.ATTENDEE,
        studentId: dto.studentId?.trim() || null,
        affiliation: dto.affiliation?.trim() || 'Attendee',
        isActive: true,
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
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
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
