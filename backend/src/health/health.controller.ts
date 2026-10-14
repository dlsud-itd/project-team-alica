import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

export type HealthCheckResponse = {
  status: 'ok' | 'degraded';
  timestamp: string;
  database: 'connected' | 'disconnected';
};

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthCheckResponse> {
    const isDbHealthy = await this.prismaService.isHealthy();

    if (!isDbHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isDbHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      database: isDbHealthy ? 'connected' : 'disconnected',
    };
  }
}
