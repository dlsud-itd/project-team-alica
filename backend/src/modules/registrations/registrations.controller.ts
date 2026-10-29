import { Controller, Post, Get, Patch, Body, Param } from '@nestjs/common';
import {
  RegistrationsService,
  CreateRegistrationDto,
  RegistrationResponseDto,
  TicketProfileDto,
  EventRegistrantDto,
} from './registrations.service.js';

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

  @Get(':ticketCode')
  async getByTicketCode(
    @Param('ticketCode') ticketCode: string,
  ): Promise<{ success: boolean; data: TicketProfileDto }> {
    const data = await this.service.findByTicketCode(ticketCode);
    return {
      success: true,
      data,
    };
  }

  @Get('event/:eventId')
  async getByEventId(
    @Param('eventId') eventId: string,
  ): Promise<{ success: boolean; data: EventRegistrantDto[] }> {
    const data = await this.service.findByEventId(eventId);
    return {
      success: true,
      data,
    };
  }

  @Patch(':id/toggle-check-in')
  async toggleCheckIn(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: EventRegistrantDto }> {
    const data = await this.service.toggleCheckIn(id);
    return {
      success: true,
      data,
    };
  }
}
