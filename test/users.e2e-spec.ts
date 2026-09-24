import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { Role } from './../src/generated/prisma/client';
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
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.category.deleteMany();
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

  describe('Consulta do próprio perfil', () => {
    const password = 'senha-forte-123';

    const signUpAndLogin = async (name: string, email: string) => {
      const { body: user } = await postUser({ name, email, password }).expect(
        201,
      );
      const { body: tokens } = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return { user, accessToken: tokens.accessToken as string };
    };

    const getMe = (accessToken: string) =>
      request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

    it('retorna exatamente os campos públicos do usuário autenticado', async () => {
      const { user, accessToken } = await signUpAndLogin(
        'Ana',
        'ana@teste.com',
      );

      const res = await getMe(accessToken).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(
        ['createdAt', 'email', 'id', 'name', 'role'].sort(),
      );
      expect(res.body).toEqual({
        id: user.id,
        name: 'Ana',
        email: 'ana@teste.com',
        role: 'CUSTOMER',
        createdAt: user.createdAt,
      });
    });

    it('retorna o perfil do dono do token', async () => {
      await signUpAndLogin('Ana', 'ana@teste.com');
      const { accessToken } = await signUpAndLogin('Bia', 'bia@teste.com');

      const res = await getMe(accessToken).expect(200);

      expect(res.body.email).toBe('bia@teste.com');
    });

    it('responde 401 sem token', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  describe('Gestão de usuários pelo ADMIN', () => {
    const password = 'senha-forte-123';
    const publicFields = ['createdAt', 'email', 'id', 'name', 'role'];
    const missingId = '00000000-0000-4000-8000-000000000000';

    type Tokens = { accessToken: string; refreshToken: string };

    const createUser = async (name: string, email: string, role: Role) =>
      prisma.user.create({
        data: {
          name,
          email,
          role,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        },
      });

    const login = async (email: string): Promise<Tokens> => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      return res.body;
    };

    const refresh = (refreshToken: string) =>
      request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken });

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
    });

    const decodeRole = (jwt: string) =>
      JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role;

    const staff = {
      name: 'Bia',
      email: 'bia@teste.com',
      password: 'senhaSegura123',
      role: 'SUPPORT',
    };

    let admin: { id: string };
    let ADM1: string;

    beforeEach(async () => {
      admin = await createUser('Admin', 'admin@treinadesk.com', Role.ADMIN);
      ADM1 = (await login('admin@treinadesk.com')).accessToken;
    });

    describe('Restrição de rotas por papel', () => {
      it('CUSTOMER recebe 403 em GET /users', async () => {
        await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
        const { accessToken } = await login('ana@teste.com');

        await as(accessToken).get('/users').expect(403);
      });

      it('SUPPORT recebe 403 em GET /users', async () => {
        await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { accessToken } = await login('bia@teste.com');

        await as(accessToken).get('/users').expect(403);
      });

      it('papel sem acesso recebe 403 mesmo com corpo inválido', async () => {
        await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
        const { accessToken } = await login('ana@teste.com');

        await as(accessToken).post('/users/staff', {}).expect(403);
      });

      it('rota restrita sem token responde 401', async () => {
        await request(app.getHttpServer()).get('/users').expect(401);
      });

      it('GET /users/me continua aberto a SUPPORT', async () => {
        await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { accessToken } = await login('bia@teste.com');

        const res = await as(accessToken).get('/users/me').expect(200);
        expect(res.body.role).toBe('SUPPORT');
      });
    });

    describe('Listagem paginada de usuários', () => {
      beforeEach(async () => {
        await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
        await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
      });

      it('usa page 1 e limit 20 por padrão e retorna só campos públicos', async () => {
        const res = await as(ADM1).get('/users').expect(200);

        expect(Object.keys(res.body).sort()).toEqual([
          'data',
          'limit',
          'page',
          'total',
        ]);
        expect(res.body).toMatchObject({ page: 1, limit: 20, total: 3 });
        expect(res.body.data).toHaveLength(3);
        for (const user of res.body.data) {
          expect(Object.keys(user).sort()).toEqual(publicFields);
        }
      });

      it('retorna a segunda página sem repetir usuários', async () => {
        const first = await as(ADM1).get('/users?page=1&limit=2').expect(200);
        const second = await as(ADM1).get('/users?page=2&limit=2').expect(200);

        expect(second.body).toMatchObject({ page: 2, limit: 2, total: 3 });
        expect(second.body.data).toHaveLength(1);
        const firstIds = first.body.data.map((u: { id: string }) => u.id);
        expect(firstIds).not.toContain(second.body.data[0].id);
      });

      it('página além do fim retorna data vazio', async () => {
        const res = await as(ADM1).get('/users?page=5&limit=20').expect(200);

        expect(res.body).toEqual({ data: [], page: 5, limit: 20, total: 3 });
      });

      it('aceita limit=100', async () => {
        const res = await as(ADM1).get('/users?limit=100').expect(200);

        expect(res.body.limit).toBe(100);
      });

      it.each([
        ['limit', 'limit=101'],
        ['page', 'page=0'],
        ['page', 'page=abc'],
      ])('responde 400 citando %s para %s', async (field, query) => {
        const res = await as(ADM1).get(`/users?${query}`).expect(400);

        expectFieldError(res.body, field);
      });
    });

    describe('Cadastro de membros da equipe', () => {
      it('cadastra a atendente Bia com os campos públicos', async () => {
        const res = await as(ADM1).post('/users/staff', staff).expect(201);

        expect(Object.keys(res.body).sort()).toEqual(publicFields);
        expect(res.body).toMatchObject({
          name: 'Bia',
          email: 'bia@teste.com',
          role: 'SUPPORT',
        });
      });

      it('a atendente cadastrada faz login com o papel SUPPORT', async () => {
        await as(ADM1).post('/users/staff', staff).expect(201);

        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: 'bia@teste.com', password: 'senhaSegura123' })
          .expect(200);
        expect(decodeRole(res.body.accessToken)).toBe('SUPPORT');
      });

      it('cadastra outro ADMIN', async () => {
        const res = await as(ADM1)
          .post('/users/staff', { ...staff, role: 'ADMIN' })
          .expect(201);

        expect(res.body.role).toBe('ADMIN');
      });

      it.each([
        ['CUSTOMER', { ...staff, role: 'CUSTOMER' }],
        ['inexistente', { ...staff, role: 'AGENT' }],
        [
          'ausente',
          {
            name: 'Bia',
            email: 'bia@teste.com',
            password: 'senhaSegura123',
          },
        ],
      ])('recusa papel %s com 400 citando role', async (_desc, body) => {
        const res = await as(ADM1).post('/users/staff', body).expect(400);

        expectFieldError(res.body, 'role');
        expect(
          await prisma.user.count({ where: { email: 'bia@teste.com' } }),
        ).toBe(0);
      });

      it('aplica as mesmas validações do cadastro público', async () => {
        const res = await as(ADM1)
          .post('/users/staff', {
            role: 'SUPPORT',
            name: 'B',
            email: 'nao-e-email',
            password: 'curta12',
          })
          .expect(400);

        for (const field of ['name', 'email', 'password']) {
          expectFieldError(res.body, field);
        }
      });

      it('normaliza o e-mail e responde 409 para duplicado', async () => {
        await createUser('Bia', 'bia@teste.com', Role.SUPPORT);

        await as(ADM1)
          .post('/users/staff', { ...staff, email: '  BIA@Teste.com ' })
          .expect(409);
        expect(
          await prisma.user.count({ where: { email: 'bia@teste.com' } }),
        ).toBe(1);
      });

      it('rejeita propriedade extra', async () => {
        const res = await as(ADM1)
          .post('/users/staff', { ...staff, isVip: true })
          .expect(400);

        expectFieldError(res.body, 'isVip');
      });

      it('SUPPORT recebe 403 e nenhum usuário é criado', async () => {
        await createUser('Carla', 'carla@teste.com', Role.SUPPORT);
        const { accessToken } = await login('carla@teste.com');

        await as(accessToken).post('/users/staff', staff).expect(403);
        expect(
          await prisma.user.count({ where: { email: 'bia@teste.com' } }),
        ).toBe(0);
      });
    });

    describe('Alteração de papel pelo administrador', () => {
      it('promove cliente a atendente', async () => {
        const ana = await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);

        const res = await as(ADM1)
          .patch(`/users/${ana.id}/role`, { role: 'SUPPORT' })
          .expect(200);

        expect(Object.keys(res.body).sort()).toEqual(publicFields);
        expect(res.body).toMatchObject({
          id: ana.id,
          email: 'ana@teste.com',
          role: 'SUPPORT',
        });
      });

      it('o novo papel vale no próximo login', async () => {
        const bia = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        await as(ADM1)
          .patch(`/users/${bia.id}/role`, { role: 'ADMIN' })
          .expect(200);

        const { accessToken } = await login('bia@teste.com');

        await as(accessToken).get('/users').expect(200);
      });

      it('ADMIN alterando o próprio papel recebe 422 e o papel não muda', async () => {
        await as(ADM1)
          .patch(`/users/${admin.id}/role`, { role: 'CUSTOMER' })
          .expect(422);

        const stored = await prisma.user.findUniqueOrThrow({
          where: { id: admin.id },
        });
        expect(stored.role).toBe(Role.ADMIN);
      });

      it('usuário inexistente responde 404', async () => {
        await as(ADM1)
          .patch(`/users/${missingId}/role`, { role: 'SUPPORT' })
          .expect(404);
      });

      it('identificador malformado responde 400', async () => {
        await as(ADM1)
          .patch('/users/abc/role', { role: 'SUPPORT' })
          .expect(400);
      });

      it('papel inválido responde 400 sem alterar', async () => {
        const ana = await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);

        const res = await as(ADM1)
          .patch(`/users/${ana.id}/role`, { role: 'AGENT' })
          .expect(400);

        expectFieldError(res.body, 'role');
        const stored = await prisma.user.findUniqueOrThrow({
          where: { id: ana.id },
        });
        expect(stored.role).toBe(Role.CUSTOMER);
      });

      it('SUPPORT recebe 403 e o papel não muda', async () => {
        const ana = await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
        await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { accessToken } = await login('bia@teste.com');

        await as(accessToken)
          .patch(`/users/${ana.id}/role`, { role: 'ADMIN' })
          .expect(403);
        const stored = await prisma.user.findUniqueOrThrow({
          where: { id: ana.id },
        });
        expect(stored.role).toBe(Role.CUSTOMER);
      });
    });

    describe('Revogação de sessões ao alterar o papel', () => {
      it('refresh token anterior à alteração é recusado', async () => {
        const bia = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { refreshToken: R1 } = await login('bia@teste.com');

        await as(ADM1)
          .patch(`/users/${bia.id}/role`, { role: 'CUSTOMER' })
          .expect(200);

        await refresh(R1).expect(401);
      });

      it('revoga todas as sessões do usuário', async () => {
        const bia = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { refreshToken: R1 } = await login('bia@teste.com');
        const { refreshToken: S1 } = await login('bia@teste.com');

        await as(ADM1)
          .patch(`/users/${bia.id}/role`, { role: 'ADMIN' })
          .expect(200);

        await refresh(R1).expect(401);
        await refresh(S1).expect(401);
      });

      it('preserva as sessões de outros usuários', async () => {
        const bia = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
        await login('bia@teste.com');
        const { refreshToken: R2 } = await login('ana@teste.com');

        await as(ADM1)
          .patch(`/users/${bia.id}/role`, { role: 'CUSTOMER' })
          .expect(200);

        await refresh(R2).expect(200);
      });

      it('alteração recusada não revoga sessões', async () => {
        const { accessToken, refreshToken: R3 } = await login(
          'admin@treinadesk.com',
        );

        await as(accessToken)
          .patch(`/users/${admin.id}/role`, { role: 'SUPPORT' })
          .expect(422);

        await refresh(R3).expect(200);
      });

      it('access token antigo mantém o papel até expirar', async () => {
        const bia = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
        const { accessToken: B1 } = await login('bia@teste.com');

        await as(ADM1)
          .patch(`/users/${bia.id}/role`, { role: 'CUSTOMER' })
          .expect(200);

        const res = await as(B1).get('/users/me').expect(200);
        expect(decodeRole(B1)).toBe('SUPPORT');
        expect(res.body.role).toBe('CUSTOMER');
      });
    });
  });
});
