import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { EventsModule } from './modules/events/events.module.js';
import { RegistrationsModule } from './modules/registrations/registrations.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

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
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [EventsModule, RegistrationsModule, AuthModule],
})
export class AppModule {}
