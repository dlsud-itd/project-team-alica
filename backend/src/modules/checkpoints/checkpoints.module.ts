import { Module } from '@nestjs/common';
import { CheckpointsController } from './checkpoints.controller.js';
import { CheckpointsService } from './checkpoints.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CheckpointsController],
  providers: [CheckpointsService],
  exports: [CheckpointsService],
})
export class CheckpointsModule {}

