import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserRole } from '@prisma/client';

describe('AuthController', () => {
  let controller: AuthController;
  let service: AuthService;

  beforeEach(async () => {
    const mockAuthService = {
      login: vi.fn().mockResolvedValue({
        user: {
          id: 'usr-attendee-alen',
          email: 'amc.umandal@gmail.com',
          fullName: 'Alen Mikel Umandal',
          role: UserRole.ATTENDEE,
          studentId: '2023-01982-MN-0',
          affiliation: 'College of Science and Computer Studies',
        },
        token: 'mock-jwt-token-xyz',
      }),
      register: vi.fn().mockResolvedValue({
        user: {
          id: 'usr-new-id',
          email: 'newuser@example.com',
          fullName: 'New User',
          role: UserRole.ATTENDEE,
          studentId: null,
          affiliation: 'Attendee',
        },
        token: 'mock-jwt-token-new',
      }),
      getMe: vi.fn().mockResolvedValue({
        id: 'usr-attendee-alen',
        email: 'amc.umandal@gmail.com',
        fullName: 'Alen Mikel Umandal',
        role: UserRole.ATTENDEE,
        studentId: '2023-01982-MN-0',
        affiliation: 'College of Science and Computer Studies',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should handle login successfully', async () => {
    const loginSpy = vi.spyOn(service, 'login');
    const res = await controller.login({
      email: 'amc.umandal@gmail.com',
      password: 'SecurePassword123!',
    });

    expect(res.success).toBe(true);
    expect(res.data.user.email).toBe('amc.umandal@gmail.com');
    expect(res.data.token).toBe('mock-jwt-token-xyz');
    expect(loginSpy).toHaveBeenCalledWith({
      email: 'amc.umandal@gmail.com',
      password: 'SecurePassword123!',
    });
  });

  it('should handle registration successfully', async () => {
    const res = await controller.register({
      fullName: 'New User',
      email: 'newuser@example.com',
      password: 'SecurePassword123!',
    });

    expect(res.success).toBe(true);
    expect(res.data.user.fullName).toBe('New User');
    expect(res.data.token).toBe('mock-jwt-token-new');
  });

  it('should return profile for current user', async () => {
    const res = await controller.getMe('Bearer valid-token');
    expect(res.success).toBe(true);
    expect(res.data.email).toBe('amc.umandal@gmail.com');
  });

  it('should reject getMe if no authorization header', async () => {
    await expect(controller.getMe(undefined)).rejects.toThrow(
      'Authorization header is required',
    );
  });
});
