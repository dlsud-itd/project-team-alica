import {
  Controller,
  Post,
  Get,
  Body,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { MailService } from './mail.service.js';
import { SendTestMailDto, SendCustomMailDto } from './dto/send-mail.dto.js';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('verify')
  async verify() {
    const result = await this.mailService.verifyConnection();
    return result;
  }

  @Post('test')
  async sendTest(@Body() dto: SendTestMailDto) {
    if (!dto?.to || typeof dto.to !== 'string' || !dto.to.includes('@')) {
      throw new BadRequestException('A valid recipient email address "to" is required');
    }

    const result = await this.mailService.sendTestEmail(dto.to);
    if (!result.success) {
      throw new InternalServerErrorException({
        message: 'Failed to send test email',
        error: result.error,
      });
    }

    return {
      message: `Test email dispatched to ${dto.to}`,
      messageId: result.messageId,
    };
  }

  @Post('send')
  async sendCustom(@Body() dto: SendCustomMailDto) {
    if (!dto?.to || !dto?.subject) {
      throw new BadRequestException('"to" and "subject" are required');
    }

    const result = await this.mailService.sendMail({
      to: dto.to,
      subject: dto.subject,
      text: dto.text,
      html: dto.html,
    });

    if (!result.success) {
      throw new InternalServerErrorException({
        message: 'Failed to send email',
        error: result.error,
      });
    }

    return {
      message: 'Email dispatched successfully',
      messageId: result.messageId,
    };
  }
}

