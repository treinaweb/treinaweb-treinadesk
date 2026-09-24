import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

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
