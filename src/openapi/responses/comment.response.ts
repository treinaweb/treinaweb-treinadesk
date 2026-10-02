import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryResponse } from './user.response.js';

// Espelha commentSelect (src/comments/comment-select.ts).
export class CommentResponse {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Segue o comprovante' })
  body: string;

  @ApiProperty({
    example: false,
    description: 'Nota interna: nunca é devolvida para CUSTOMER.',
  })
  isInternal: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: UserSummaryResponse })
  author: UserSummaryResponse;
}
