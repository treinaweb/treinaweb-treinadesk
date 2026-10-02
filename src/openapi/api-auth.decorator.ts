import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../generated/prisma/client.js';
import { ErrorResponse } from './responses/error.response.js';

interface ApiAuthOptions {
  summary: string;
  description?: string;
  // Os mesmos papéis do @Roles da rota; ausente = qualquer autenticado.
  roles?: Role[];
}

// Documenta uma rota protegida: esquema Bearer, 401 e, se houver papéis, 403
// com os papéis aceitos na descrição. Não protege nada: quem protege são o
// JwtAuthGuard e o RolesGuard. Rotas @Public() usam só @ApiOperation.
export function ApiAuth({ summary, description, roles }: ApiAuthOptions) {
  const access = roles?.length
    ? `Papéis: ${roles.join(', ')}.`
    : 'Qualquer usuário autenticado.';
  const decorators = [
    ApiOperation({
      summary,
      description: description ? `${description}\n\n${access}` : access,
    }),
    ApiBearerAuth('bearer'),
    ApiUnauthorizedResponse({
      type: ErrorResponse,
      description: 'Sem token, token inválido ou expirado.',
    }),
  ];
  if (roles?.length) {
    decorators.push(
      ApiForbiddenResponse({
        type: ErrorResponse,
        description: `Papel sem acesso à rota (aceitos: ${roles.join(', ')}).`,
      }),
    );
  }
  return applyDecorators(...decorators);
}
