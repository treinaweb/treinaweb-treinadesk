import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { normalizeEmail } from '../normalize-email.js';

export class CreateUserDto {
  @ApiProperty({ minLength: 2, maxLength: 100, example: 'Ana' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    format: 'email',
    maxLength: 200,
    example: 'ana@teste.com',
    description: 'Normalizado (minúsculas, sem espaços nas extremidades).',
  })
  @Transform(({ value }) => normalizeEmail(value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'senhaSegura123' })
  @IsString()
  @Length(8, 128)
  password: string;
}
