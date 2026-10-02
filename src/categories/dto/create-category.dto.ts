import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/dto/trim.js';

export class CreateCategoryDto {
  @ApiProperty({ minLength: 2, maxLength: 60, example: 'Financeiro' })
  @Trim()
  @IsString()
  @Length(2, 60)
  name: string;
}
