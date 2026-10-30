import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import {
  EventsService,
  EventResponseDto,
  OrganizerDashboardDto,
} from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly authService: AuthService,
  ) {}

  @Get('organizer')
  async getOrganizerEvents(
    @Headers('authorization') authHeader?: string,
  ): Promise<{ success: boolean; data: OrganizerDashboardDto }> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    const user = await this.authService.getMe(authHeader);
    if (user.role !== 'ORGANIZER') {
      throw new ForbiddenException('Organizer access is required');
    }

    const data = await this.eventsService.findForOrganizer(user.id);
    return { success: true, data };
  }

  @Get()
  async getEvents(): Promise<{ success: boolean; data: EventResponseDto[] }> {
    const data = await this.eventsService.findAll();
    return {
      success: true,
      data,
    };
  }
}
