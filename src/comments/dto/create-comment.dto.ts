import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/dto/trim.js';

// Sem authorId nem ticketId: vêm do token e da rota; o ValidationPipe os
// recusa com 400.
export class CreateCommentDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 5000,
    example: 'Segue o comprovante',
    description: 'Espaços nas extremidades são removidos.',
  })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Nota interna, só para SUPPORT e ADMIN (CUSTOMER recebe 403).',
  })
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
