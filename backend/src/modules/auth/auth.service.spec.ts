import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { UserRole } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'usr-attendee-alen',
    email: 'amc.umandal@gmail.com',
    passwordHash:
      '$2b$10$wB5W.3W/1tV4rBwYqZfX/O4mKq9g7O7R/0fH0q0g5P6G9V4Q2Z0kS',
    fullName: 'Alen Mikel Umandal',
    role: UserRole.ATTENDEE,
    studentId: '2023-01982-MN-0',
    affiliation: 'College of Science and Computer Studies',
    isActive: true,
    mustChangePassword: false,
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('login', () => {
    it('should throw BadRequestException if email or password missing', async () => {
      await expect(
        service.login({ email: '', password: '123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(
        service.login({
          email: 'amc.umandal@gmail.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return user and token when credentials are valid', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      const res = await service.login({
        email: 'amc.umandal@gmail.com',
        password: 'SecurePassword123!',
      });

      expect(res.user.email).toBe('amc.umandal@gmail.com');
      expect(res.user.fullName).toBe('Alen Mikel Umandal');
      expect(res.user.mustChangePassword).toBe(false);
      expect(typeof res.token).toBe('string');
      expect(res.token.length).toBeGreaterThan(10);
    });

    describe('changePassword', () => {
      it('updates the password hash and clears the first-login requirement', async () => {
        vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
          ...mockUser,
          mustChangePassword: true,
        } as any);
        vi.spyOn(prisma.user, 'update').mockResolvedValue({} as any);
        vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
        vi.spyOn(bcrypt, 'hash').mockResolvedValue('new-hash' as never);

        const result = await service.changePassword(
          {
            id: mockUser.id,
            email: mockUser.email,
            fullName: mockUser.fullName,
            role: mockUser.role,
            mustChangePassword: true,
          },
          { currentPassword: 'Temporary123', newPassword: 'Permanent123' },
        );

        expect(prisma.user.update.mock.calls[0][0]).toEqual({
          where: { id: mockUser.id },
          data: { passwordHash: 'new-hash', mustChangePassword: false },
        });
        expect(result.mustChangePassword).toBe(false);
      });
    });
  });

  describe('register', () => {
    it('should throw BadRequestException for short passwords', async () => {
      await expect(
        service.register({
          fullName: 'Test User',
          email: 'test@example.com',
          password: 'short',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if email is already taken', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser as any);

      await expect(
        service.register({
          fullName: 'Test User',
          email: 'amc.umandal@gmail.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create new user and return token on valid registration', async () => {
      vi.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.user, 'create').mockResolvedValue({
        id: 'usr-new-id',
        email: 'newuser@example.com',
        fullName: 'New User',
        role: UserRole.ATTENDEE,
        studentId: '2026-99999',
        affiliation: 'CS Department',
        isActive: true,
      } as any);

      const res = await service.register({
        fullName: 'New User',
        email: 'newuser@example.com',
        password: 'SecurePassword123!',
        studentId: '2026-99999',
        affiliation: 'CS Department',
      });

      expect(res.user.email).toBe('newuser@example.com');
      expect(res.user.fullName).toBe('New User');
      expect(res.token).toBeDefined();
    });
  });
});
