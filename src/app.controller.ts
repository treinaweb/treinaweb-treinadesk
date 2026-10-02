import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { ApiAuth } from './openapi/api-auth.decorator.js';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiAuth({ summary: 'Mensagem de boas-vindas' })
  @ApiOkResponse({
    schema: { type: 'string', example: 'Olá Mundo Treinaweb!' },
  })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
