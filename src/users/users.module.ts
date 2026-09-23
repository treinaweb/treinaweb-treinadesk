import { Module } from '@nestjs/common';
import { PasswordHasher } from './password-hasher';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordHasher],
})
export class UsersModule {}
