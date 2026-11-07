import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MailService } from './mail.service.js';
import { MAIL_PROVIDER } from './mail.constants.js';
import { MockMailProvider } from './providers/mock-mail.provider.js';
import type { IMailProvider } from './mail.interfaces.js';

describe('MailService', () => {
  let service: MailService;
  let mockProvider: MockMailProvider;

  beforeEach(async () => {
    mockProvider = new MockMailProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MAIL_PROVIDER,
          useValue: mockProvider,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should send generic email via provider', async () => {
    const result = await service.sendMail({
      to: 'test@example.com',
      subject: 'Hello World',
      text: 'Simple text',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const sent = mockProvider.getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe('test@example.com');
    expect(sent[0].subject).toBe('Hello World');
  });

  it('should send welcome email with recipient name', async () => {
    const result = await service.sendWelcomeEmail('newuser@example.com', 'Maria Santos');

    expect(result.success).toBe(true);
    const sent = mockProvider.getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe('newuser@example.com');
    expect(sent[0].subject).toBe('Welcome to Checkpoint');
    expect(sent[0].html).toContain('Maria Santos');
  });

  it('should send ticket confirmation email with ticket details', async () => {
    const result = await service.sendTicketConfirmation('attendee@example.com', {
      attendeeName: 'Juan Dela Cruz',
      eventTitle: 'Tech Summit 2026',
      ticketCode: 'CHK-2026-9999A',
      venueName: 'Grand Auditorium',
      startDate: '2026-11-15 09:00 AM',
    });

    expect(result.success).toBe(true);
    const sent = mockProvider.getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe('attendee@example.com');
    expect(sent[0].subject).toBe('Registration Confirmed: Tech Summit 2026');
    expect(sent[0].html).toContain('CHK-2026-9999A');
    expect(sent[0].html).toContain('Juan Dela Cruz');
    expect(sent[0].html).toContain('Tech Summit 2026');
  });

  it('should send test email', async () => {
    const result = await service.sendTestEmail('admin@example.com');

    expect(result.success).toBe(true);
    const sent = mockProvider.getSentEmails();
    expect(sent.length).toBe(1);
    expect(sent[0].to).toBe('admin@example.com');
    expect(sent[0].subject).toBe('Checkpoint SMTP Test Email');
  });

  it('should verify connection with active provider', async () => {
    const verification = await service.verifyConnection();
    expect(verification.connected).toBe(true);
    expect(verification.message).toContain('verified successfully');
  });

  it('should report failure when provider verification fails', async () => {
    const failingProvider: IMailProvider = {
      send: vi.fn(),
      verifyConnection: vi.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: MAIL_PROVIDER,
          useValue: failingProvider,
        },
      ],
    }).compile();

    const failingService = module.get<MailService>(MailService);
    const result = await failingService.verifyConnection();
    expect(result.connected).toBe(false);
  });
});

