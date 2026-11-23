import { Logger } from '@nestjs/common';
import type { IMailProvider, SendMailOptions, SendMailResult } from '../mail.interfaces.js';

export class MockMailProvider implements IMailProvider {
  private readonly logger = new Logger(MockMailProvider.name);
  private sentEmails: SendMailOptions[] = [];

  async send(options: SendMailOptions): Promise<SendMailResult> {
    this.sentEmails.push(options);
    const recipients = Array.isArray(options.to) ? options.to.join(', ') : options.to;
    this.logger.log(`[MOCK EMAIL SENT] To: ${recipients} | Subject: "${options.subject}"`);
    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  async verifyConnection(): Promise<boolean> {
    this.logger.log('[MOCK EMAIL] Verification check passed (mock mode active)');
    return true;
  }

  getSentEmails(): SendMailOptions[] {
    return [...this.sentEmails];
  }

  clear(): void {
    this.sentEmails = [];
  }
}

