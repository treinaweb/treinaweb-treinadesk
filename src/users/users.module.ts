import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordHasher],
  exports: [PasswordHasher],
})
export class UsersModule {}
