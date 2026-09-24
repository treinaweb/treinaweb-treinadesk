import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

function jwtOptions(): JwtModuleOptions {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) {
    throw new Error('JWT_ACCESS_SECRET não definida');
  }
  return {
    secret,
    signOptions: {
      algorithm: 'HS256',
      expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ?? '15m') as NonNullable<
        JwtModuleOptions['signOptions']
      >['expiresIn'],
    },
    verifyOptions: { algorithms: ['HS256'] },
  };
}

@Module({
  imports: [UsersModule, JwtModule.registerAsync({ useFactory: jwtOptions })],
  controllers: [AuthController],
  // Guards globais rodam na ordem de registro: o RolesGuard precisa do
  // request.user gravado pelo JwtAuthGuard, e sem token a resposta deve ser
  // 401 (não 403). Mantenha os dois aqui, nesta ordem.
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
