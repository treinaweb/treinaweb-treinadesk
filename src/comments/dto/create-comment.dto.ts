import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/dto/trim';

// Sem authorId nem ticketId: vêm do token e da rota; o ValidationPipe os
// recusa com 400.
export class CreateCommentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
