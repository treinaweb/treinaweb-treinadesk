import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Mesma versão do swagger-ui-dist instalado. Os assets vêm do CDN porque a
// função serverless da Vercel não serve os arquivos de node_modules.
const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.33.0';

// Chamado pelo main.ts e pelos e2e. Sem condição de ambiente: a documentação é
// pública também em produção. /docs e /docs-json são registradas no adaptador
// HTTP, fora dos controllers, então os APP_GUARD não se aplicam a elas.
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('TreinaDesk API')
    .setDescription(
      'API REST de helpdesk (tickets de suporte). Rotas protegidas exigem ' +
        '`Authorization: Bearer <accessToken>` obtido em `POST /auth/login`. ' +
        'Fluxo de autenticação, erros e regras de ticket para frontends: ' +
        '`docs/integracao-frontend.md` no repositório.',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: 'TreinaDesk API',
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
    ],
    swaggerOptions: { persistAuthorization: true },
  });
}
