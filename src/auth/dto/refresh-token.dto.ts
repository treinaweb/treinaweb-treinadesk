import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// Corpo de POST /auth/refresh e POST /auth/logout.
export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token recebido no login ou no último refresh.',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
