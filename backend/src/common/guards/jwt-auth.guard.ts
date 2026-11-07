import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  AuthService,
  UserSummaryDto,
} from '../../modules/auth/auth.service.js';
import { ALLOW_PASSWORD_RESET } from '../decorators/allow-password-reset.decorator.js';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: UserSummaryDto;
};

/** Verifies the Bearer token and attaches the DB user to `request.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    request.user = await this.authService.getMe(authHeader);
    const allowPasswordReset = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_RESET,
      [context.getHandler(), context.getClass()],
    );
    if (request.user.mustChangePassword && !allowPasswordReset) {
      throw new ForbiddenException('You must change your password first');
    }
    return true;
  }
}
