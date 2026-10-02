import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../users/normalize-email.js';

export class LoginDto {
  // Sem @IsEmail: um e-mail malformado não existe e cai no 401 genérico.
  @ApiProperty({ example: 'ana@teste.com' })
  @Transform(({ value }) => normalizeEmail(value))
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ maxLength: 128, example: 'senhaSegura123' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
