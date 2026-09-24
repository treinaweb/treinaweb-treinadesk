import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './authenticated-user.js';

// Usuário gravado na requisição pelo JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest().user,
);
