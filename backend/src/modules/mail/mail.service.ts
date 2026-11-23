import { Inject, Injectable, Logger } from '@nestjs/common';
import { MAIL_PROVIDER } from './mail.constants.js';
import type {
  IMailProvider,
  SendMailOptions,
  SendMailResult,
  TicketConfirmationDetails,
} from './mail.interfaces.js';
import {
  getWelcomeEmailTemplate,
  getTicketConfirmationEmailTemplate,
  getTestEmailTemplate,
} from './mail-templates.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @Inject(MAIL_PROVIDER)
    private readonly provider: IMailProvider,
  ) {}

  /**
   * Generic low-level method to send an email using the active provider.
   */
  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    return this.provider.send(options);
  }

  /**
   * Sends a welcome email upon user registration.
   */
  async sendWelcomeEmail(to: string, fullName: string): Promise<SendMailResult> {
    const { html, text } = getWelcomeEmailTemplate(fullName);
    return this.sendMail({
      to,
      subject: 'Welcome to Checkpoint',
      html,
      text,
    });
  }

  /**
   * Sends an event ticket confirmation email with ticket details and code.
   */
  async sendTicketConfirmation(
    to: string,
    details: TicketConfirmationDetails,
  ): Promise<SendMailResult> {
    const { html, text } = getTicketConfirmationEmailTemplate(details);
    return this.sendMail({
      to,
      subject: `Registration Confirmed: ${details.eventTitle}`,
      html,
      text,
    });
  }

  /**
   * Sends a test email to verify SMTP credentials and connectivity.
   */
  async sendTestEmail(to: string): Promise<SendMailResult> {
    const now = new Date().toISOString();
    const { html, text } = getTestEmailTemplate(to, now);
    return this.sendMail({
      to,
      subject: 'Checkpoint SMTP Test Email',
      html,
      text,
    });
  }

  /**
   * Verifies that the mail provider is connected and authenticating properly.
   */
  async verifyConnection(): Promise<{ connected: boolean; message: string }> {
    if (typeof this.provider.verifyConnection === 'function') {
      const ok = await this.provider.verifyConnection();
      return {
        connected: ok,
        message: ok
          ? 'Mail provider connection verified successfully.'
          : 'Mail provider connection verification failed. Check credentials and network.',
      };
    }
    return {
      connected: true,
      message: 'Active mail provider does not require explicit connection verification.',
    };
  }
}

