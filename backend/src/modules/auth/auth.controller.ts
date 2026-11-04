import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthService,
  LoginDto,
  RegisterDto,
  AuthResponseDto,
  UserSummaryDto,
} from './auth.service.js';

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
