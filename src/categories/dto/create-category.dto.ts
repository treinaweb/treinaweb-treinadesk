import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/dto/trim';

export class CreateCategoryDto {
  @Trim()
  @IsString()
  @Length(2, 60)
  name: string;
}
