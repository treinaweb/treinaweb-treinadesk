import { ApiProperty } from '@nestjs/swagger';

// Formato padrão de erro do Nest. Nos 400 de validação, message é a lista de
// problemas por campo.
export class ErrorResponse {
  @ApiProperty({ example: 422 })
  statusCode: number;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Categoria inativa',
  })
  message: string | string[];

  @ApiProperty({ example: 'Unprocessable Entity' })
  error: string;
}
