import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import nodemailer from 'nodemailer';
import * as QRCode from 'qrcode';

interface InvitationMessage {
  eventTitle: string;
  email: string;
  fullName: string;
  temporaryPassword: string;
  ticketCode: string;
}

@Injectable()
export class GuestInvitationMailer {
  private readonly logger = new Logger(GuestInvitationMailer.name);

  async assertConfigured(): Promise<void> {
    const config = this.getConfiguration();
    try {
      await this.createTransporter(config).verify();
    } catch (error) {
      this.logger.warn(
        `Invitation SMTP verification failed: ${
          error instanceof Error ? error.message : 'Unknown SMTP error'
        }`,
      );
      throw new ServiceUnavailableException(
        'Could not connect to the invitation email server. Check your SMTP settings and Gmail app password.',
      );
    }
  }

  async sendInvitation(message: InvitationMessage): Promise<void> {
    const config = this.getConfiguration();
    const transporter = this.createTransporter(config);
    const qrCodeCid = `ticket-qr-${message.ticketCode}@checkpoint`;
    const qrCode = await QRCode.toBuffer(message.ticketCode, {
      errorCorrectionLevel: 'H',
      type: 'png',
      width: 320,
      margin: 2,
    });
    const text = [
      `Hello ${message.fullName},`,
      '',
      `You have been invited to ${message.eventTitle}.`,
      `Email: ${message.email}`,
      `Temporary password: ${message.temporaryPassword}`,
      `Event ticket: ${message.ticketCode}`,
      '',
      'Your event QR ticket is attached to this email.',
      'Sign in using these credentials. You will be required to change your password on your first login.',
    ].join('\n');

    await transporter.sendMail({
      from: config.from,
      to: message.email,
      subject: `Your invitation to ${message.eventTitle}`,
      text,
      html: [
        `<p>Hello ${this.escapeHtml(message.fullName)},</p>`,
        `<p>You have been invited to <strong>${this.escapeHtml(message.eventTitle)}</strong>.</p>`,
        '<ul>',
        `<li>Email: ${this.escapeHtml(message.email)}</li>`,
        `<li>Temporary password: <strong>${this.escapeHtml(message.temporaryPassword)}</strong></li>`,
        `<li>Event ticket: ${this.escapeHtml(message.ticketCode)}</li>`,
        '</ul>',
        `<p><img src="cid:${qrCodeCid}" alt="Event ticket QR code" width="240" height="240"></p>`,
        '<p>Show this QR code when checking in. Sign in using these credentials; you will be required to change your password on your first login.</p>',
      ].join(''),
      attachments: [
        {
          filename: `ticket-${message.ticketCode}.png`,
          content: qrCode,
          contentType: 'image/png',
          cid: qrCodeCid,
          contentDisposition: 'inline',
        },
      ],
    });
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      };
      return entities[character]!;
    });
  }

  private getConfiguration(): {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    from: string;
  } {
    const {
      MAIL_DRIVER,
      SMTP_PROVIDER,
      SMTP_HOST,
      SMTP_PORT,
      SMTP_SECURE,
      SMTP_USER,
      SMTP_PASS,
      SMTP_PASSWORD,
      SMTP_FROM,
      MAIL_FROM,
    } = process.env;
    const provider = (SMTP_PROVIDER ?? MAIL_DRIVER ?? 'smtp').toLowerCase();
    const isGmail = provider === 'gmail';
    const host = isGmail ? SMTP_HOST?.trim() || 'smtp.gmail.com' : SMTP_HOST;
    const port = Number(SMTP_PORT || (isGmail ? 587 : ''));
    const password = SMTP_PASSWORD ?? SMTP_PASS;
    const secure =
      SMTP_SECURE === undefined
        ? port === 465
        : SMTP_SECURE.toLowerCase() === 'true';
    if (
      (!isGmail && provider !== 'smtp') ||
      !host ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      !SMTP_USER ||
      !password
    ) {
      throw new ServiceUnavailableException(
        'Invitation email delivery is not configured. Set MAIL_DRIVER or SMTP_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS (or SMTP_PASSWORD).',
      );
    }

    return {
      host,
      port,
      secure,
      username: SMTP_USER,
      password: isGmail ? password.replace(/\s+/g, '') : password,
      from: (MAIL_FROM ?? SMTP_FROM)?.trim() || SMTP_USER,
    };
  }

  private createTransporter(config: ReturnType<typeof this.getConfiguration>) {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      auth: { user: config.username, pass: config.password },
    });
  }
}
