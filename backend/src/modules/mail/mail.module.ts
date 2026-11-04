import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service.js';
import { MailController } from './mail.controller.js';
import { MAIL_PROVIDER } from './mail.constants.js';
import { SmtpMailProvider } from './providers/smtp-mail.provider.js';
import { MockMailProvider } from './providers/mock-mail.provider.js';

@Module({
  controllers: [MailController],
  providers: [
    {
      provide: MAIL_PROVIDER,
      useFactory: (config: ConfigService) => {
        const driver = (config.get<string>('MAIL_DRIVER') || '').toLowerCase();
        const smtpUser = config.get<string>('SMTP_USER');
        const nodeEnv = config.get<string>('NODE_ENV');

        // Use mock provider if explicitly configured, or in test environment when credentials are not supplied
        if (driver === 'mock' || (nodeEnv === 'test' && !smtpUser)) {
          return new MockMailProvider();
        }

        return new SmtpMailProvider(config);
      },
      inject: [ConfigService],
    },
    MailService,
  ],
  exports: [MailService, MAIL_PROVIDER],
})
export class MailModule {}

