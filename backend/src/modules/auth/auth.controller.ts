import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Headers,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AllowPasswordReset } from '../../common/decorators/allow-password-reset.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import {
  AuthService,
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  SavedProfileDto,
  CreateSavedProfileDto,
} from './auth.service.js';
import type { UserSummaryDto } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
  ): Promise<{ success: boolean; data: AuthResponseDto }> {
    const data = await this.authService.login(dto);
    return {
      success: true,
      data,
    };
  }

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ success: boolean; data: AuthResponseDto }> {
    const data = await this.authService.register(dto);
    return {
      success: true,
      data,
    };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @AllowPasswordReset()
  async changePassword(
    @CurrentUser() user: UserSummaryDto,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: boolean; data: UserSummaryDto }> {
    const data = await this.authService.changePassword(user, dto);
    return { success: true, data };
  }

  @Get('me')
  async getMe(
    @Headers('authorization') authHeader?: string,
  ): Promise<{ success: boolean; data: UserSummaryDto }> {
    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }
    const data = await this.authService.getMe(authHeader);
    return {
      success: true,
      data,
    };
  }

  @Get('profiles')
  @UseGuards(JwtAuthGuard)
  async getSavedProfiles(
    @CurrentUser() user: UserSummaryDto,
  ): Promise<{ success: boolean; data: SavedProfileDto[] }> {
    const data = await this.authService.getSavedProfiles(user);
    return {
      success: true,
      data,
    };
  }

  @Post('profiles')
  @UseGuards(JwtAuthGuard)
  async createSavedProfile(
    @CurrentUser() user: UserSummaryDto,
    @Body() dto: CreateSavedProfileDto,
  ): Promise<{ success: boolean; data: SavedProfileDto }> {
    const data = await this.authService.createSavedProfile(user, dto);
    return {
      success: true,
      data,
    };
  }

  @Delete('profiles/:id')
  @UseGuards(JwtAuthGuard)
  async deleteSavedProfile(
    @CurrentUser() user: UserSummaryDto,
    @Param('id') profileId: string,
  ): Promise<{ success: boolean; message: string }> {
    await this.authService.deleteSavedProfile(user, profileId);
    return {
      success: true,
      message: 'Profile removed successfully',
    };
  }
}
