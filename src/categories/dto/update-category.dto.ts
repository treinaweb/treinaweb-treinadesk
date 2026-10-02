import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, Length, ValidateIf } from 'class-validator';
import { Trim } from '../../common/dto/trim.js';

// Campos ausentes não são alterados; null é rejeitado (ao contrário de @IsOptional).
const IfPresent = () => ValidateIf((_, value) => value !== undefined);

export class UpdateCategoryDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 60, example: 'Financeiro' })
  @IfPresent()
  @Trim()
  @IsString()
  @Length(2, 60)
  name?: string;

  @ApiPropertyOptional({ example: false })
  @IfPresent()
  @IsBoolean()
  active?: boolean;
}
