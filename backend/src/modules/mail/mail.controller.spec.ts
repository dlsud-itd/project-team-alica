import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { MailController } from './mail.controller.js';
import { MailService } from './mail.service.js';

describe('MailController', () => {
  let controller: MailController;
  let mailService: {
    verifyConnection: ReturnType<typeof vi.fn>;
    sendTestEmail: ReturnType<typeof vi.fn>;
    sendMail: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mailService = {
      verifyConnection: vi.fn(),
      sendTestEmail: vi.fn(),
      sendMail: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MailController],
      providers: [
        {
          provide: MailService,
          useValue: mailService,
        },
      ],
    }).compile();

    controller = module.get<MailController>(MailController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should verify connection', async () => {
    mailService.verifyConnection.mockResolvedValue({ connected: true, message: 'OK' });
    const result = await controller.verify();
    expect(result.connected).toBe(true);
  });

  it('should reject test email without valid email', async () => {
    await expect(controller.sendTest({ to: 'invalid-email' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should send test email successfully', async () => {
    mailService.sendTestEmail.mockResolvedValue({ success: true, messageId: 'msg-123' });
    const result = await controller.sendTest({ to: 'recipient@example.com' });
    expect(result.messageId).toBe('msg-123');
    expect(mailService.sendTestEmail).toHaveBeenCalledWith('recipient@example.com');
  });

  it('should throw 500 when test email fails to send', async () => {
    mailService.sendTestEmail.mockResolvedValue({
      success: false,
      error: 'SMTP connection timed out',
    });
    await expect(controller.sendTest({ to: 'recipient@example.com' })).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

