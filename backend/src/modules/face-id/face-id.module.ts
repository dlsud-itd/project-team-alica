import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { FaceIdController } from './face-id.controller.js';
import { FaceIdService } from './face-id.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 10,
      },
    ]),
  ],
  controllers: [FaceIdController],
  providers: [FaceIdService],
  exports: [FaceIdService],
})
export class FaceIdModule {}
