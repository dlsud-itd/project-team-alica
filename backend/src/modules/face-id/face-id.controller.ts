import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserSummaryDto } from '../auth/auth.service.js';
import { FaceIdService } from './face-id.service.js';
import { RegisterFaceIdDto } from './dto/register-face-id.dto.js';
import { FaceStatusDto } from './dto/face-status.dto.js';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class FaceIdController {
  constructor(private readonly faceIdService: FaceIdService) {}

  @Get('face-status')
  async getStatus(@CurrentUser() user: UserSummaryDto): Promise<FaceStatusDto> {
    return this.faceIdService.getStatus(user.id);
  }

  @Post('face')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @HttpCode(HttpStatus.OK)
  async registerFace(
    @CurrentUser() user: UserSummaryDto,
    @Body() dto: RegisterFaceIdDto,
  ): Promise<{ success: boolean; message: string; registeredAt: string }> {
    return this.faceIdService.registerFace(user.id, dto.descriptor);
  }

  @Delete('face')
  @HttpCode(HttpStatus.OK)
  async removeFace(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; message: string }> {
    return this.faceIdService.removeFace(user.id);
  }
}
