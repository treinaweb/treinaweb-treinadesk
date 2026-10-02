import { ApiProperty } from '@nestjs/swagger';

// Espelha TokenPair (src/auth/auth.service.ts).
export class TokenPairResponse {
  @ApiProperty({
    description: 'JWT de acesso (padrão 15 min). Envie como Bearer.',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Token opaco de renovação (padrão 7 dias). É rotacionado a cada uso: ' +
      'reutilizar um refresh token já usado revoga a sessão.',
  })
  refreshToken: string;
}
