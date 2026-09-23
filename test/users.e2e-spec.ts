import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';

// E-mail válido com exatamente `length` caracteres (parte local <= 64, rótulos <= 63).
function emailWithLength(length: number): string {
  const local = 'a'.repeat(64);
  const fixed = `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}..com`.length;
  return `${local}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - fixed)}.com`;
}

function expectFieldError(body: { message: string[] }, field: string) {
  expect(body.message).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp(`^(${field} |property ${field} should not exist)`),
      ),
    ]),
  );
}

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const validUser = {
    name: 'Ana',
    email: 'ana@teste.com',
    password: 'senhaSegura123',
  };

  const postUser = (body: object) =>
    request(app.getHttpServer()).post('/users').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('Cadastro público de cliente', () => {
    it('cadastra com dados válidos e responde 201 com os campos públicos', async () => {
      const res = await postUser(validUser).expect(201);

      expect(Object.keys(res.body).sort()).toEqual([
        'createdAt',
        'email',
        'id',
        'name',
        'role',
      ]);
      expect(res.body).toMatchObject({
        name: 'Ana',
        email: 'ana@teste.com',
        role: 'CUSTOMER',
      });
      expect(typeof res.body.id).toBe('string');
      expect(Number.isNaN(Date.parse(res.body.createdAt))).toBe(false);
    });

    it('persiste o usuário criado', async () => {
      await postUser(validUser).expect(201);
      await postUser(validUser).expect(409);
      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('Validação dos dados de cadastro', () => {
    it.each([
      ['name', 'curto demais', { name: 'A' }],
      ['name', 'longo demais', { name: 'a'.repeat(101) }],
      ['email', 'inválido', { email: 'nao-e-email' }],
      ['email', 'longo demais', { email: emailWithLength(201) }],
      ['password', 'curta demais', { password: 'a'.repeat(7) }],
      ['password', 'longa demais', { password: 'a'.repeat(129) }],
    ])('rejeita %s %s com 400', async (field, _desc, override) => {
      const res = await postUser({ ...validUser, ...override }).expect(400);

      expectFieldError(res.body, field);
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejeita corpo vazio indicando name, email e password', async () => {
      const res = await postUser({}).expect(400);

      expectFieldError(res.body, 'name');
      expectFieldError(res.body, 'email');
      expectFieldError(res.body, 'password');
      expect(await prisma.user.count()).toBe(0);
    });

    it('aceita os valores-limite', async () => {
      const email = emailWithLength(200);
      expect(email).toHaveLength(200);

      await postUser({
        name: 'Al',
        email,
        password: 'a'.repeat(128),
      }).expect(201);
    });
  });

  describe('Rejeição de propriedades não declaradas', () => {
    it('rejeita tentativa de definir o papel', async () => {
      const res = await postUser({ ...validUser, role: 'ADMIN' }).expect(400);

      expectFieldError(res.body, 'role');
      expect(await prisma.user.count()).toBe(0);
    });

    it('rejeita propriedade extra e não cria o usuário', async () => {
      const res = await postUser({ ...validUser, isVip: true }).expect(400);

      expectFieldError(res.body, 'isVip');
      expect(await prisma.user.count()).toBe(0);
      await postUser(validUser).expect(201);
    });
  });

  describe('E-mail normalizado e único', () => {
    it('normaliza o e-mail na resposta', async () => {
      const res = await postUser({
        ...validUser,
        email: '  Ana@Teste.COM  ',
      }).expect(201);

      expect(res.body.email).toBe('ana@teste.com');
    });

    it('retorna 409 para e-mail duplicado idêntico', async () => {
      await postUser(validUser).expect(201);
      await postUser(validUser).expect(409);
    });

    it('retorna 409 para e-mail duplicado com maiúsculas', async () => {
      await postUser(validUser).expect(201);
      await postUser({ ...validUser, email: 'ANA@teste.com' }).expect(409);
      expect(await prisma.user.count()).toBe(1);
    });
  });

  describe('Proteção da senha', () => {
    it('não retorna a senha nem o hash', async () => {
      const res = await postUser(validUser).expect(201);

      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(Object.values(res.body)).not.toContain(validUser.password);
    });

    it('armazena a senha como hash argon2id', async () => {
      const res = await postUser(validUser).expect(201);

      const user = await prisma.user.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(user.passwordHash).not.toBe(validUser.password);
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(await argon2.verify(user.passwordHash, validUser.password)).toBe(
        true,
      );
    });

    it('não ecoa a senha em respostas de erro', async () => {
      const res = await postUser({ ...validUser, password: 'curta12' }).expect(
        400,
      );

      expect(JSON.stringify(res.body)).not.toContain('curta12');
    });
  });
});
