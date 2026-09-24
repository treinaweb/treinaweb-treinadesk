import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from '../normalize-email.js';

export class CreateUserDto {
  @IsString()
  @Length(2, 100)
  name: string;

  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @Length(8, 128)
  password: string;
}
