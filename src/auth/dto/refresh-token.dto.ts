import { IsNotEmpty, IsString } from 'class-validator';

// Corpo de POST /auth/refresh e POST /auth/logout.
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
