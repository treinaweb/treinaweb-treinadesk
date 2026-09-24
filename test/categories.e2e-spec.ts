import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Role } from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'senha-forte-123';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

function expectFieldError(body: { message: string[] }, field: string) {
  expect(body.message).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp(`^(${field} |property ${field} should not exist)`),
      ),
    ]),
  );
}

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let ADM1: string;
  let A1: string;
  let B1: string;

  const createUser = async (name: string, email: string, role: Role) =>
    prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      },
    });

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken;
  };

  const as = (accessToken: string) => ({
    get: (url: string) =>
      request(app.getHttpServer())
        .get(url)
        .set('Authorization', `Bearer ${accessToken}`),
    post: (url: string, body: object) =>
      request(app.getHttpServer())
        .post(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body),
    patch: (url: string, body: object) =>
      request(app.getHttpServer())
        .patch(url)
        .set('Authorization', `Bearer ${accessToken}`)
        .send(body),
    delete: (url: string) =>
      request(app.getHttpServer())
        .delete(url)
        .set('Authorization', `Bearer ${accessToken}`),
  });

  const createCategory = (name: string, active = true) =>
    prisma.category.create({ data: { name, active } });

  const names = (body: { name: string }[]) => body.map((c) => c.name);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await createUser('Admin', 'admin@treinadesk.com', Role.ADMIN);
    await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
    await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
    ADM1 = await login('admin@treinadesk.com');
    A1 = await login('ana@teste.com');
    B1 = await login('bia@teste.com');
  });

  afterAll(async () => {
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('Listagem de categorias por papel', () => {
    beforeEach(async () => {
      await createCategory('Financeiro');
      await createCategory('Legado', false);
    });

    it('CUSTOMER vê só as ativas, com exatamente id e name', async () => {
      const res = await as(A1).get('/categories').expect(200);

      expect(names(res.body)).toEqual(['Financeiro']);
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
    });

    it('SUPPORT vê só as ativas', async () => {
      const res = await as(B1).get('/categories').expect(200);

      expect(names(res.body)).toEqual(['Financeiro']);
    });

    it('ADMIN vê todas, com o campo active', async () => {
      const res = await as(ADM1).get('/categories').expect(200);

      expect(res.body).toEqual([
        { id: expect.any(String), name: 'Financeiro', active: true },
        { id: expect.any(String), name: 'Legado', active: false },
      ]);
    });

    it('responde 401 sem token', async () => {
      await request(app.getHttpServer()).get('/categories').expect(401);
    });
  });

  describe('Ordenação e lista vazia', () => {
    it('ordena por nome', async () => {
      await createCategory('Suporte Técnico');
      await createCategory('Acesso');
      await createCategory('Financeiro');

      const res = await as(A1).get('/categories').expect(200);

      expect(names(res.body)).toEqual([
        'Acesso',
        'Financeiro',
        'Suporte Técnico',
      ]);
    });

    it('retorna array vazio sem categorias', async () => {
      const res = await as(A1).get('/categories').expect(200);

      expect(res.body).toEqual([]);
    });
  });

  describe('Criação de categoria', () => {
    it('cria com active true e exatamente id, name e active', async () => {
      const res = await as(ADM1)
        .post('/categories', { name: 'Financeiro' })
        .expect(201);

      expect(res.body).toEqual({
        id: expect.any(String),
        name: 'Financeiro',
        active: true,
      });
    });

    it('remove espaços nas extremidades do nome', async () => {
      const res = await as(ADM1)
        .post('/categories', { name: '  Financeiro  ' })
        .expect(201);

      expect(res.body.name).toBe('Financeiro');
    });

    it.each([
      ['curto após remover espaços', '  F  '],
      ['longo demais', 'x'.repeat(61)],
    ])('responde 400 para nome %s', async (_desc, name) => {
      const res = await as(ADM1).post('/categories', { name }).expect(400);

      expectFieldError(res.body, 'name');
      expect(await prisma.category.count()).toBe(0);
    });

    it('aceita nomes de 2 e de 60 caracteres', async () => {
      await as(ADM1).post('/categories', { name: 'TI' }).expect(201);
      await as(ADM1)
        .post('/categories', { name: 'y'.repeat(60) })
        .expect(201);
    });

    it('responde 400 sem name ou com propriedade extra', async () => {
      const empty = await as(ADM1).post('/categories', {}).expect(400);
      expectFieldError(empty.body, 'name');

      const extra = await as(ADM1)
        .post('/categories', { name: 'Financeiro', active: false })
        .expect(400);
      expectFieldError(extra.body, 'active');
    });

    it('responde 409 para nome duplicado', async () => {
      await createCategory('Financeiro');

      await as(ADM1).post('/categories', { name: ' Financeiro ' }).expect(409);
      expect(
        await prisma.category.count({ where: { name: 'Financeiro' } }),
      ).toBe(1);
    });

    it('CUSTOMER e SUPPORT recebem 403', async () => {
      await as(A1).post('/categories', { name: 'Financeiro' }).expect(403);
      await as(B1).post('/categories', { name: 'Financeiro' }).expect(403);
      expect(await prisma.category.count()).toBe(0);
    });
  });

  describe('Alteração de categoria', () => {
    let financeiro: { id: string };
    let legado: { id: string };

    beforeEach(async () => {
      financeiro = await createCategory('Financeiro');
      legado = await createCategory('Legado', false);
    });

    it('renomeia', async () => {
      const res = await as(ADM1)
        .patch(`/categories/${financeiro.id}`, { name: 'Cobrança' })
        .expect(200);

      expect(res.body).toEqual({
        id: financeiro.id,
        name: 'Cobrança',
        active: true,
      });
    });

    it('desativa e a categoria some para o CUSTOMER', async () => {
      const res = await as(ADM1)
        .patch(`/categories/${financeiro.id}`, { active: false })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Financeiro', active: false });
      const list = await as(A1).get('/categories').expect(200);
      expect(names(list.body)).not.toContain('Financeiro');
    });

    it('reativa e a categoria volta para o CUSTOMER', async () => {
      const res = await as(ADM1)
        .patch(`/categories/${legado.id}`, { active: true })
        .expect(200);

      expect(res.body.active).toBe(true);
      const list = await as(A1).get('/categories').expect(200);
      expect(names(list.body)).toContain('Legado');
    });

    it('altera nome e status juntos', async () => {
      const res = await as(ADM1)
        .patch(`/categories/${legado.id}`, { name: 'Acesso', active: true })
        .expect(200);

      expect(res.body).toMatchObject({ name: 'Acesso', active: true });
    });

    it('responde 409 para nome de outra categoria', async () => {
      await as(ADM1)
        .patch(`/categories/${legado.id}`, { name: 'Financeiro' })
        .expect(409);

      const stored = await prisma.category.findUniqueOrThrow({
        where: { id: legado.id },
      });
      expect(stored.name).toBe('Legado');
    });

    it('aceita reenviar o próprio nome', async () => {
      await as(ADM1)
        .patch(`/categories/${financeiro.id}`, { name: 'Financeiro' })
        .expect(200);
    });

    it('responde 404 para categoria inexistente', async () => {
      await as(ADM1)
        .patch(`/categories/${MISSING_ID}`, { active: false })
        .expect(404);
    });

    it('responde 400 para identificador malformado', async () => {
      await as(ADM1).patch('/categories/abc', { active: false }).expect(400);
    });

    it.each([
      ['vazio', {}],
      ['com nome curto', { name: 'F' }],
      ['com active não booleano', { active: 'sim' }],
    ])('responde 400 para corpo %s sem alterar', async (_desc, body) => {
      await as(ADM1).patch(`/categories/${financeiro.id}`, body).expect(400);

      const stored = await prisma.category.findUniqueOrThrow({
        where: { id: financeiro.id },
      });
      expect(stored).toMatchObject({ name: 'Financeiro', active: true });
    });

    it('SUPPORT recebe 403 e a categoria não muda', async () => {
      await as(B1)
        .patch(`/categories/${financeiro.id}`, { active: false })
        .expect(403);

      const stored = await prisma.category.findUniqueOrThrow({
        where: { id: financeiro.id },
      });
      expect(stored.active).toBe(true);
    });
  });

  describe('Categorias não são excluídas', () => {
    it('DELETE responde 404 e a categoria continua ativa', async () => {
      const financeiro = await createCategory('Financeiro');

      await as(ADM1).delete(`/categories/${financeiro.id}`).expect(404);

      const res = await as(ADM1).get('/categories').expect(200);
      expect(res.body).toEqual([
        { id: financeiro.id, name: 'Financeiro', active: true },
      ]);
    });
  });
});
