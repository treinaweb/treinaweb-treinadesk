import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupOpenApi } from './openapi/setup-openapi.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupOpenApi(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
