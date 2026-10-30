import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserSummaryDto } from '../../modules/auth/auth.service.js';
import type { AuthenticatedRequest } from '../guards/jwt-auth.guard.js';

/** The user resolved by `JwtAuthGuard`. Only use on guarded routes. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): UserSummaryDto => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user!;
  },
);
