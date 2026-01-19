import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserPayload } from '../../modules/auth/interfaces/auth.interface';

export const CurrentUser = createParamDecorator<UserPayload>((data: unknown, ctx: ExecutionContext): UserPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user as UserPayload;
});
