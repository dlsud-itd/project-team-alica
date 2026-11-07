import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { RegistrationsModule } from './modules/registrations/registrations.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MailModule } from './modules/mail/mail.module.js';
import { CheckpointsModule } from './modules/checkpoints/checkpoints.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    EventsModule,
    RegistrationsModule,
    AuthModule,
    MailModule,
    CheckpointsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [EventsModule, RegistrationsModule, AuthModule, MailModule, CheckpointsModule],
})
export class AppModule {}
