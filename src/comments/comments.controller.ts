import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Paginated } from '../common/dto/paginated.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { CommentView } from './comment-select.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

// Sem @Roles: quem pode comentar depende do ticket (visibilidade → 404,
// commentPolicy → 403/422), decidido no service.
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommentView> {
    return this.commentsService.create(ticketId, dto, user);
  }

  @Get()
  list(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<CommentView>> {
    return this.commentsService.list(ticketId, query, user);
  }
}
