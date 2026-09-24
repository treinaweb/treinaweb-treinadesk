import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService],
  // Comentários reutilizam findVisibleOrFail em vez de duplicar a visibilidade.
  exports: [TicketsService],
})
export class TicketsModule {}
