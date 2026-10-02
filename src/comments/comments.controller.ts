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
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Paginated } from '../common/dto/paginated.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ApiAuth } from '../openapi/api-auth.decorator.js';
import { CommentResponse } from '../openapi/responses/comment.response.js';
import { ErrorResponse } from '../openapi/responses/error.response.js';
import { PaginatedCommentsResponse } from '../openapi/responses/paginated.response.js';
import { CommentView } from './comment-select.js';
import { CommentsService } from './comments.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';

// Sem @Roles: quem pode comentar depende do ticket (visibilidade → 404,
// commentPolicy → 403/422), decidido no service.
const NOT_VISIBLE =
  'Ticket inexistente ou fora da sua visibilidade (mesma resposta nos dois casos).';

@ApiTags('comments')
@ApiParam({ name: 'ticketId', format: 'uuid' })
@Controller('tickets/:ticketId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @ApiAuth({
    summary: 'Comenta no ticket',
    description:
      'Podem comentar o cliente dono, o atendente atribuído e qualquer ADMIN. ' +
      'Comentário do cliente dono em ticket WAITING_CUSTOMER muda o status ' +
      'para IN_PROGRESS.',
  })
  @ApiCreatedResponse({ type: CommentResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'ticketId ou corpo inválido.',
  })
  @ApiForbiddenResponse({
    type: ErrorResponse,
    description: 'CUSTOMER enviando isInternal: true.',
  })
  @ApiNotFoundResponse({ type: ErrorResponse, description: NOT_VISIBLE })
  @ApiConflictResponse({
    type: ErrorResponse,
    description: 'O status do ticket mudou durante a retomada automática.',
  })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponse,
    description: 'Atendente não atribuído ao ticket ou ticket CLOSED.',
  })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CommentView> {
    return this.commentsService.create(ticketId, dto, user);
  }

  @ApiAuth({
    summary: 'Lista comentários do ticket (paginada)',
    description:
      'Em ordem de criação. Para CUSTOMER, notas internas não aparecem nem ' +
      'contam no total.',
  })
  @ApiOkResponse({ type: PaginatedCommentsResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'ticketId ou paginação inválidos.',
  })
  @ApiNotFoundResponse({ type: ErrorResponse, description: NOT_VISIBLE })
  @Get()
  list(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query() query: PaginationQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<CommentView>> {
    return this.commentsService.list(ticketId, query, user);
  }
}
