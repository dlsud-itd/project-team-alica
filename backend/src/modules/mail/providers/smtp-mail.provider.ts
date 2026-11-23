import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { IMailProvider, SendMailOptions, SendMailResult } from '../mail.interfaces.js';

export class SmtpMailProvider implements IMailProvider {
  private readonly logger = new Logger(SmtpMailProvider.name);
  private transporter: Transporter;
  private defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<string>('SMTP_PORT')) || 465;
    const secure =
      this.configService.get<string>('SMTP_SECURE') !== undefined
        ? this.configService.get<string>('SMTP_SECURE') === 'true'
        : port === 465;

    const user = this.configService.get<string>('SMTP_USER') || '';
    // Strip spaces in app passwords (Google displays them in 4x4 blocks like 'abcd efgh ijkl mnop')
    const pass = (this.configService.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');

    this.defaultFrom =
      this.configService.get<string>('SMTP_FROM') ||
      (user ? `Checkpoint <${user}>` : 'Checkpoint <no-reply@checkpoint.local>');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    this.logger.log(
      `SMTP Mail Provider initialized (Host: ${host}, Port: ${port}, Secure: ${secure}, Auth: ${user ? 'Configured' : 'None'})`,
    );
  }

  async send(options: SendMailOptions): Promise<SendMailResult> {
    try {
      const from = options.from || this.defaultFrom;
      const info = await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        replyTo: options.replyTo,
        cc: options.cc,
        bcc: options.bcc,
        attachments: options.attachments,
      });

      const recipientCount = Array.isArray(options.to) ? options.to.length : 1;
      this.logger.log(
        `Email sent successfully to ${recipientCount} recipient(s). Message ID: ${info.messageId}`,
      );

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send email: ${errorMessage}`);

      if (errorMessage.includes('535') || errorMessage.includes('BadCredentials') || errorMessage.includes('Username and Password not accepted')) {
        this.logger.warn(
          'Gmail authentication rejected. Ensure 2-Step Verification is ON and you are using a 16-character Google App Password (not your personal account password).',
        );
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      this.logger.log('SMTP connection verification succeeded');
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMTP connection verification failed: ${errorMessage}`);
      return false;
    }
  }
}

