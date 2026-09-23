import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../users/normalize-email';

export class LoginDto {
  // Sem @IsEmail: um e-mail malformado não existe e cai no 401 genérico.
  @Transform(({ value }) => normalizeEmail(value))
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
