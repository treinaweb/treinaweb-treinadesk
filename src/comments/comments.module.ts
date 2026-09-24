import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [TicketsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
