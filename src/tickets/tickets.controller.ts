import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Roles } from '../auth/roles.decorator.js';
import { Paginated } from '../common/dto/paginated.js';
import { Role } from '../generated/prisma/client.js';
import { AssignTicketDto } from './dto/assign-ticket.dto.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto.js';
import { UpdateStatusDto } from './dto/update-status.dto.js';
import { TicketView } from './ticket-select.js';
import { TicketsService } from './tickets.service.js';

// Autorização em duas camadas: @Roles por rota (403) e visibilidade por
// registro no service (404).
@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Roles(Role.CUSTOMER)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketView> {
    return this.ticketsService.create(dto, user);
  }

  @Get()
  findAll(
    @Query() query: ListTicketsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<TicketView>> {
    return this.ticketsService.findAll(query, user);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketView> {
    return this.ticketsService.findVisibleOrFail(id, user);
  }

  @Roles(Role.SUPPORT, Role.ADMIN)
  @Patch(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketView> {
    return this.ticketsService.assign(id, dto, user);
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketView> {
    return this.ticketsService.changeStatus(id, dto, user);
  }
}
