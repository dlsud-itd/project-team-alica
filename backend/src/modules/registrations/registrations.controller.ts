import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import {
  RegistrationsService,
  CreateRegistrationDto,
  RegistrationResponseDto,
  TicketProfileDto,
  AttendeeRsvpDto,
} from './registrations.service.js';
import type { TicketProgressDto } from '../checkpoints/ticket-progress.js';

@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Post()
  async register(
    @Body() dto: CreateRegistrationDto,
  ): Promise<{ success: boolean; data: RegistrationResponseDto }> {
    const data = await this.service.create(dto);
    return {
      success: true,
      data,
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMine(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: TicketProfileDto }> {
    const data = await this.service.findForUser(user);
    return {
      success: true,
      data,
    };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async getMyRsvps(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: AttendeeRsvpDto[] }> {
    const data = await this.service.findMine(user);
    return {
      success: true,
      data,
    };
  }

  @Patch(':ticketCode/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelRsvp(
    @CurrentUser() user: UserSummaryDto,
    @Param('ticketCode') ticketCode: string,
  ): Promise<{ success: boolean; data: AttendeeRsvpDto }> {
    const data = await this.service.cancelRsvp(user, ticketCode);
    return {
      success: true,
      data,
    };
  }

  @Get('event/:eventIdOrSlug/progress')
  @UseGuards(JwtAuthGuard)
  async getMyProgressForEvent(
    @CurrentUser() user: UserSummaryDto,
    @Param('eventIdOrSlug') eventIdOrSlug: string,
  ): Promise<{ success: boolean; data: TicketProgressDto | null }> {
    const data = await this.service.getMyProgressForEvent(user, eventIdOrSlug);
    return {
      success: true,
      data,
    };
  }

  @Get(':ticketCode/progress')
  @UseGuards(JwtAuthGuard)
  async getProgress(
    @CurrentUser() user: UserSummaryDto,
    @Param('ticketCode') ticketCode: string,
  ): Promise<{ success: boolean; data: TicketProgressDto }> {
    const data = await this.service.getProgress(user, ticketCode);
    return {
      success: true,
      data,
    };
  }

  @Get(':ticketCode')
  @UseGuards(JwtAuthGuard)
  async getByTicketCode(
    @CurrentUser() user: UserSummaryDto,
    @Param('ticketCode') ticketCode: string,
  ): Promise<{ success: boolean; data: TicketProfileDto }> {
    const data = await this.service.findByTicketCode(user, ticketCode);
    return {
      success: true,
      data,
    };
  }
}
