import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CheckpointsService,
  CreateSubBoothDto,
  ScanOutcomeDto,
  ScanRequestBodyDto,
  StaffCheckpointDto,
} from './checkpoints.service.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserSummaryDto } from '../auth/auth.service.js';

@Controller('checkpoints')
@UseGuards(JwtAuthGuard)
export class CheckpointsController {
  constructor(private readonly checkpointsService: CheckpointsService) {}

  @Get('my')
  async getMyCheckpoints(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto[] }> {
    const data = await this.checkpointsService.findMyCheckpoints(user);
    return {
      success: true,
      data,
    };
  }

  @Get()
  async getCheckpoints(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto[] }> {
    const data = await this.checkpointsService.findMyCheckpoints(user);
    return {
      success: true,
      data,
    };
  }

  @Post(':id/scan')
  @HttpCode(HttpStatus.OK)
  async scanTicket(
    @CurrentUser() user: UserSummaryDto,
    @Param('id') checkpointId: string,
    @Body() dto: ScanRequestBodyDto,
  ): Promise<{ success: boolean; statusCode: number; message: string; data: ScanOutcomeDto }> {
    const data = await this.checkpointsService.scan(user, checkpointId, dto);
    return {
      success: true,
      statusCode: 200,
      message: data.message,
      data,
    };
  }

  @Post(':id/sub-booths')
  async createSubBooth(
    @CurrentUser() user: UserSummaryDto,
    @Param('id') parentId: string,
    @Body() dto: CreateSubBoothDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto }> {
    if (user.role !== 'ADMIN' && user.role !== 'ORGANIZER') {
      throw new ForbiddenException('Only organizers can add sub-booths.');
    }
    const data = await this.checkpointsService.createSubBooth(parentId, dto);
    return {
      success: true,
      data,
    };
  }

  @Get('attendees/:ticketCode/history')
  async getAttendeeHistory(@Param('ticketCode') ticketCode: string) {
    const data = await this.checkpointsService.getAttendeeHistory(ticketCode);
    return {
      success: true,
      data,
    };
  }
}