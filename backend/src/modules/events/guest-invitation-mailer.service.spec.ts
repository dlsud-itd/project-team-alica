import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createTransport, toBuffer, transporter } = vi.hoisted(() => {
  const mockedTransporter = {
    verify: vi.fn(),
    sendMail: vi.fn(),
  };
  return {
    createTransport: vi.fn(() => mockedTransporter),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('test-png')),
    transporter: mockedTransporter,
  };
});

vi.mock('nodemailer', () => ({
  default: { createTransport },
}));

vi.mock('qrcode', () => ({
  toBuffer,
}));

import { GuestInvitationMailer } from './guest-invitation-mailer.service.js';

describe('GuestInvitationMailer', () => {
  let mailer: GuestInvitationMailer;

  beforeEach(() => {
    vi.stubEnv('MAIL_DRIVER', 'gmail');
    vi.stubEnv('SMTP_HOST', '');
    vi.stubEnv('SMTP_PORT', '');
    vi.stubEnv('SMTP_SECURE', '');
    vi.stubEnv('SMTP_USER', 'organizer@gmail.com');
    vi.stubEnv('SMTP_PASS', 'abcd efgh ijkl mnop');
    vi.stubEnv('SMTP_FROM', '');
    transporter.verify.mockResolvedValue(true);
    transporter.sendMail.mockResolvedValue({ messageId: 'message-1' });
    mailer = new GuestInvitationMailer();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('verifies Gmail SMTP credentials before allowing imports', async () => {
    await mailer.assertConfigured();

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: 'organizer@gmail.com',
          pass: 'abcdefghijklmnop',
        },
      }),
    );
    expect(transporter.verify).toHaveBeenCalledOnce();
  });

  it('sends an invitation with the account and event ticket details', async () => {
    await mailer.sendInvitation({
      eventTitle: 'Campus Summit',
      email: 'guest@example.org',
      fullName: 'Alex Guest',
      temporaryPassword: 'a1B2c3D4e5',
      ticketCode: 'CHK-TEST',
    });

    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'organizer@gmail.com',
        to: 'guest@example.org',
        subject: 'Your invitation to Campus Summit',
        text: expect.stringContaining('Event ticket: CHK-TEST'),
        html: expect.stringContaining('cid:ticket-qr-CHK-TEST@checkpoint'),
        attachments: [
          expect.objectContaining({
            filename: 'ticket-CHK-TEST.png',
            content: Buffer.from('test-png'),
            contentType: 'image/png',
            cid: 'ticket-qr-CHK-TEST@checkpoint',
            contentDisposition: 'inline',
          }),
        ],
      }),
    );
    expect(toBuffer).toHaveBeenCalledWith(
      'CHK-TEST',
      expect.objectContaining({ type: 'png', errorCorrectionLevel: 'H' }),
    );
  });

  it('rejects imports before writes when Gmail SMTP verification fails', async () => {
    transporter.verify.mockRejectedValueOnce(new Error('Invalid login'));

    await expect(mailer.assertConfigured()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('accepts the project SMTP_PASS and SMTP_FROM settings', async () => {
    vi.stubEnv('MAIL_DRIVER', 'smtp');
    vi.stubEnv('SMTP_HOST', 'smtp.example.org');
    vi.stubEnv('SMTP_PORT', '465');
    vi.stubEnv('SMTP_SECURE', 'true');
    vi.stubEnv('SMTP_PASS', 'smtp-app-password');
    vi.stubEnv('SMTP_FROM', 'Checkpoint <noreply@example.org>');

    await mailer.assertConfigured();
    await mailer.sendInvitation({
      eventTitle: 'Campus Summit',
      email: 'guest@example.org',
      fullName: 'Alex Guest',
      temporaryPassword: 'a1B2c3D4e5',
      ticketCode: 'CHK-TEST',
    });

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.org',
        port: 465,
        secure: true,
        auth: {
          user: 'organizer@gmail.com',
          pass: 'smtp-app-password',
        },
      }),
    );
    expect(transporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Checkpoint <noreply@example.org>' }),
    );
  });
});
