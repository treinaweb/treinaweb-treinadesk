import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  it('/ (GET) sem token responde 401', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('/ (GET) com token válido responde 200', async () => {
    const credentials = {
      email: 'ana@teste.com',
      password: 'senha-forte-123',
    };
    await request(app.getHttpServer())
      .post('/users')
      .send({ name: 'Ana', ...credentials })
      .expect(201);
    const { body } = await request(app.getHttpServer())
      .post('/auth/login')
      .send(credentials)
      .expect(200);

    await request(app.getHttpServer())
      .get('/')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect('Olá Mundo Treinaweb!');
  });

  afterEach(async () => {
    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });
});
