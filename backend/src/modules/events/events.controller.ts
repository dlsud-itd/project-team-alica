import { Controller, Get } from '@nestjs/common';
import { EventsService, EventResponseDto } from './events.service.js';

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
}

