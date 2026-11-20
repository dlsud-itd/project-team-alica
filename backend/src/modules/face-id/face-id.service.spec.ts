import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FaceIdService } from './face-id.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('FaceIdService', () => {
  let service: FaceIdService;
  let mockPrisma: {
    user: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };

  const sampleDescriptor = Array.from({ length: 128 }, (_, i) => i * 0.01);

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaceIdService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<FaceIdService>(FaceIdService);
  });

  describe('getStatus', () => {
    it('returns { registered: false } when user has no faceDescriptor', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        faceDescriptor: [],
        faceRegisteredAt: null,
      });

      const result = await service.getStatus('user-1');
      expect(result).toEqual({ registered: false });
      expect((result as any).faceDescriptor).toBeUndefined();
    });

    it('returns { registered: true } when user has a valid 128-float descriptor', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        faceDescriptor: sampleDescriptor,
        faceRegisteredAt: new Date(),
      });

      const result = await service.getStatus('user-1');
      expect(result).toEqual({ registered: true });
      expect((result as any).faceDescriptor).toBeUndefined();
    });

    it('throws NotFoundException if user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getStatus('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('registerFace', () => {
    it('successfully saves descriptor and returns success confirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });

      const result = await service.registerFace('user-1', sampleDescriptor);
      expect(result.success).toBe(true);
      expect(result.message).toContain('Face ID registered successfully');
      expect(result.registeredAt).toBeDefined();

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          faceDescriptor: sampleDescriptor,
          faceRegisteredAt: expect.any(Date),
        },
        select: { id: true },
      });
    });

    it('rejects if descriptor does not have 128 numbers', async () => {
      const shortDescriptor = [0.1, 0.2, 0.3];
      await expect(
        service.registerFace('user-1', shortDescriptor),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if descriptor contains non-finite numbers', async () => {
      const invalidDescriptor = [...sampleDescriptor];
      invalidDescriptor[10] = NaN;

      await expect(
        service.registerFace('user-1', invalidDescriptor),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.registerFace('unknown-user', sampleDescriptor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeFace', () => {
    it('clears faceDescriptor and faceRegisteredAt', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
      mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });

      const result = await service.removeFace('user-1');
      expect(result).toEqual({
        success: true,
        message: 'Face ID removed successfully',
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          faceDescriptor: [],
          faceRegisteredAt: null,
        },
        select: { id: true },
      });
    });

    it('throws NotFoundException if user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.removeFace('unknown-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
