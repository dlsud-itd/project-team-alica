import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_RESET = 'allowPasswordReset';
export const AllowPasswordReset = () => SetMetadata(ALLOW_PASSWORD_RESET, true);
