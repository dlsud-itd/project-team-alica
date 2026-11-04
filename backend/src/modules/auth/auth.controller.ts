import {
  Controller,
  Post,
  Get,
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
}
