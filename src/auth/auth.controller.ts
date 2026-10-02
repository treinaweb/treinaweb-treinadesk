import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiAuth } from '../openapi/api-auth.decorator.js';
import { ErrorResponse } from '../openapi/responses/error.response.js';
import { TokenPairResponse } from '../openapi/responses/token-pair.response.js';
import { AuthService, TokenPair } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { Public } from './public.decorator.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @ApiOperation({
    summary: 'Login',
    description: 'Rota pública. Devolve o access token e o refresh token.',
  })
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description: 'Credenciais inválidas.',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<TokenPair> {
    return this.authService.login(dto.email, dto.password);
  }

  @Public()
  @ApiOperation({
    summary: 'Renova os tokens',
    description:
      'Rota pública. Troca o refresh token por um novo par; o refresh token ' +
      'enviado deixa de valer. Reenviar um refresh token já usado (inclusive ' +
      'em duas requisições concorrentes) é tratado como reutilização: todas ' +
      'as sessões do usuário são revogadas e a resposta é 401.',
  })
  @ApiOkResponse({ type: TokenPairResponse })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponse,
    description:
      'Refresh token inexistente, expirado, revogado ou reutilizado.',
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refresh(dto.refreshToken);
  }

  @ApiAuth({
    summary: 'Logout',
    description:
      'Revoga o refresh token informado (se for do usuário do token).',
  })
  @ApiNoContentResponse({ description: 'Sessão encerrada.' })
  @ApiBadRequestResponse({
    type: ErrorResponse,
    description: 'Corpo inválido.',
  })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
  ): Promise<void> {
    return this.authService.logout(user.id, dto.refreshToken);
  }
}
