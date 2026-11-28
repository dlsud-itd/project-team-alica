import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CheckpointsService,
  CreateCheckpointDto,
  CreateSubBoothDto,
  ScanOutcomeDto,
  ScanRequestBodyDto,
  StaffCheckpointDto,
  StationDetailsDto,
  UpdateCheckpointDto,
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
    const data = await this.checkpointsService.findAccessibleCheckpoints(user);
    return {
      success: true,
      data,
    };
  }

  @Get('attendees/:ticketCode/history')
  async getAttendeeHistory(
    @CurrentUser() user: UserSummaryDto,
    @Param('ticketCode') ticketCode: string,
  ) {
    const data = await this.checkpointsService.getAttendeeHistory(
      user,
      ticketCode,
    );
    return {
      success: true,
      data,
    };
  }

  @Get(':boothId')
  async getStation(
    @CurrentUser() user: UserSummaryDto,
    @Param('boothId') boothId: string,
  ): Promise<{ success: boolean; data: StationDetailsDto }> {
    const data = await this.checkpointsService.findStationById(user, boothId);
    return {
      success: true,
      data,
    };
  }

  @Post(':boothId/scan')
  @HttpCode(HttpStatus.OK)
  async scanTicket(
    @CurrentUser() user: UserSummaryDto,
    @Param('boothId') boothId: string,
    @Body() dto: ScanRequestBodyDto,
  ): Promise<{
    success: boolean;
    statusCode: number;
    message: string;
    data: ScanOutcomeDto;
  }> {
    const data = await this.checkpointsService.scan(user, boothId, dto);
    return {
      success: true,
      statusCode: 200,
      message: data.message,
      data,
    };
  }

  @Post()
  async createCheckpoint(
    @CurrentUser() user: UserSummaryDto,
    @Body() dto: CreateCheckpointDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto }> {
    const data = await this.checkpointsService.createCheckpoint(user, dto);
    return { success: true, data };
  }

  @Post(':boothId/sub-booths')
  async createSubBooth(
    @CurrentUser() user: UserSummaryDto,
    @Param('boothId') boothId: string,
    @Body() dto: CreateSubBoothDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto }> {
    const data = await this.checkpointsService.createSubBooth(
      user,
      boothId,
      dto,
    );
    return {
      success: true,
      data,
    };
  }

  @Patch(':boothId')
  async updateCheckpoint(
    @CurrentUser() user: UserSummaryDto,
    @Param('boothId') boothId: string,
    @Body() dto: UpdateCheckpointDto,
  ): Promise<{ success: boolean; data: StaffCheckpointDto }> {
    const data = await this.checkpointsService.updateCheckpoint(user, boothId, dto);
    return { success: true, data };
  }

  @Delete(':boothId')
  async removeCheckpoint(
    @CurrentUser() user: UserSummaryDto,
    @Param('boothId') boothId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.checkpointsService.removeCheckpoint(user, boothId);
    return { success: true, message: 'Booth removed successfully' };
  }
}
