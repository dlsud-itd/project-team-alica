import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  AdminEventDto,
  CreateEventDto,
  EventsService,
  EventResponseDto,
  EventRegistrantDto,
  OrganizerEventDto,
  ReviewEventDto,
  UpdateEventDto,
} from './events.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async getEvents(): Promise<{ success: boolean; data: EventResponseDto[] }> {
    const data = await this.eventsService.findAll();
    return {
      success: true,
      data,
    };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  async getMyEvents(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: OrganizerEventDto[] }> {
    const data = await this.eventsService.findForOrganizer(user);
    return {
      success: true,
      data,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createEvent(
    @CurrentUser() user: UserSummaryDto,
    @Body() dto: CreateEventDto,
  ): Promise<{ success: boolean; data: OrganizerEventDto }> {
    const data = await this.eventsService.create(user, dto);
    return {
      success: true,
      data,
    };
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard)
  async getAdminEvents(
    @CurrentUser() user: UserSummaryDto,
    @Query('status') status?: string,
  ): Promise<{ success: boolean; data: AdminEventDto[] }> {
    const data = await this.eventsService.findAllForAdmin(user, status);
    return {
      success: true,
      data,
    };
  }

  @Patch(':eventId/review')
  @UseGuards(JwtAuthGuard)
  async reviewEvent(
    @CurrentUser() user: UserSummaryDto,
    @Param('eventId') eventId: string,
    @Body() dto: ReviewEventDto,
  ): Promise<{ success: boolean; data: AdminEventDto }> {
    const data = await this.eventsService.review(user, eventId, dto);
    return {
      success: true,
      data,
    };
  }

  @Patch(':eventId')
  @UseGuards(JwtAuthGuard)
  async updateEvent(
    @CurrentUser() user: UserSummaryDto,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateEventDto,
  ): Promise<{ success: boolean; data: OrganizerEventDto }> {
    const data = await this.eventsService.update(user, eventId, dto);
    return {
      success: true,
      data,
    };
  }

  @Get(':eventId/registrants')
  @UseGuards(JwtAuthGuard)
  async getRegistrants(
    @CurrentUser() user: UserSummaryDto,
    @Param('eventId') eventId: string,
  ): Promise<{ success: boolean; data: EventRegistrantDto[] }> {
    const data = await this.eventsService.findRegistrants(user, eventId);
    return {
      success: true,
      data,
    };
  }

  @Patch(':eventId/registrants/:registrantId/check-in')
  @UseGuards(JwtAuthGuard)
  async toggleCheckIn(
    @CurrentUser() user: UserSummaryDto,
    @Param('eventId') eventId: string,
    @Param('registrantId') registrantId: string,
  ): Promise<{ success: boolean; data: EventRegistrantDto }> {
    const data = await this.eventsService.toggleCheckIn(
      user,
      eventId,
      registrantId,
    );
    return {
      success: true,
      data,
    };
  }
}
