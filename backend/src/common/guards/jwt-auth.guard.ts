import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthService,
  UserSummaryDto,
} from '../../modules/auth/auth.service.js';

export type AuthenticatedRequest = {
  headers: { authorization?: string };
  user?: UserSummaryDto;
};

/** Verifies the Bearer token and attaches the DB user to `request.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is required');
    }

    request.user = await this.authService.getMe(authHeader);
    return true;
  }
}
