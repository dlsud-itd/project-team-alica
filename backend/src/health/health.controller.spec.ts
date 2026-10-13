import { HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { vi } from 'vitest';
import { HealthController } from './health.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let prismaService: { isHealthy: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prismaService = {
      isHealthy: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prismaService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return ok and connected status when database is healthy', async () => {
    prismaService.isHealthy.mockResolvedValue(true);
    const statusSpy = vi.fn();
    const mockResponse = {
      status: statusSpy,
    } as unknown as Response;

    const result = await controller.check(mockResponse);
    expect(result.status).toBe('ok');
    expect(result.database).toBe('connected');
    expect(result.timestamp).toBeDefined();
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('should return degraded and disconnected with 503 when database is unhealthy', async () => {
    prismaService.isHealthy.mockResolvedValue(false);
    const statusSpy = vi.fn();
    const mockResponse = {
      status: statusSpy,
    } as unknown as Response;

    const result = await controller.check(mockResponse);
    expect(result.status).toBe('degraded');
    expect(result.database).toBe('disconnected');
    expect(result.timestamp).toBeDefined();
    expect(statusSpy).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
