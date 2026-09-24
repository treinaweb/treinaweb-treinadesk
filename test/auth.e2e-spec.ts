import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { hashRefreshToken } from './../src/auth/refresh-token';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'senha-forte-123';

type TokenPair = { accessToken: string; refreshToken: string };

function decodePayload(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
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

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const http = () => request(app.getHttpServer());

  const signUp = (name: string, email: string) =>
    http().post('/users').send({ name, email, password: PASSWORD }).expect(201);

  const login = async (email: string): Promise<TokenPair> => {
    const res = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body;
  };

  const refresh = (refreshToken: string) =>
    http().post('/auth/refresh').send({ refreshToken });

  const me = (accessToken: string) =>
    http().get('/users/me').set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('Login com e-mail e senha', () => {
    it('responde 200 com exatamente accessToken e refreshToken', async () => {
      await signUp('Ana', 'ana@teste.com');

      const res = await http()
        .post('/auth/login')
        .send({ email: 'ana@teste.com', password: PASSWORD })
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.accessToken).not.toBe('');
      expect(typeof res.body.refreshToken).toBe('string');
      expect(res.body.refreshToken).not.toBe('');
    });

    it('aceita e-mail com maiúsculas e espaços', async () => {
      await signUp('Ana', 'ana@teste.com');

      const res = await http()
        .post('/auth/login')
        .send({ email: '  ANA@Teste.com ', password: PASSWORD })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('rejeita corpo vazio com 400 citando email e password', async () => {
      const res = await http().post('/auth/login').send({}).expect(400);

      expectFieldError(res.body, 'email');
      expectFieldError(res.body, 'password');
    });

    it('rejeita propriedade extra com 400', async () => {
      const res = await http()
        .post('/auth/login')
        .send({ email: 'ana@teste.com', password: PASSWORD, role: 'ADMIN' })
        .expect(400);

      expectFieldError(res.body, 'role');
    });
  });

  describe('Credenciais inválidas indistinguíveis', () => {
    it('senha errada e e-mail inexistente respondem 401 com o mesmo corpo', async () => {
      await signUp('Ana', 'ana@teste.com');

      const wrongPassword = await http()
        .post('/auth/login')
        .send({ email: 'ana@teste.com', password: 'senha-errada-000' })
        .expect(401);
      const unknownEmail = await http()
        .post('/auth/login')
        .send({ email: 'ninguem@teste.com', password: PASSWORD })
        .expect(401);

      expect(wrongPassword.body.message).toBe('Credenciais inválidas');
      expect(unknownEmail.body).toEqual(wrongPassword.body);
      expect(wrongPassword.body).not.toHaveProperty('accessToken');
      expect(wrongPassword.body).not.toHaveProperty('refreshToken');
      expect(JSON.stringify(wrongPassword.body)).not.toContain(
        'senha-errada-000',
      );
      expect(JSON.stringify(unknownEmail.body)).not.toContain(PASSWORD);
    });
  });

  describe('Access token', () => {
    it('contém sub, email e role e expira em 15 minutos', async () => {
      const { body: user } = await signUp('Ana', 'ana@teste.com');
      const { accessToken } = await login('ana@teste.com');

      const payload = decodePayload(accessToken);

      expect(payload.sub).toBe(user.id);
      expect(payload.email).toBe('ana@teste.com');
      expect(payload.role).toBe('CUSTOMER');
      expect((payload.exp as number) - (payload.iat as number)).toBe(900);
      expect(payload).not.toHaveProperty('password');
      expect(payload).not.toHaveProperty('passwordHash');
    });
  });

  describe('Autenticação obrigatória por padrão', () => {
    let validPayload: { sub: string; email: string; role: string };

    beforeEach(async () => {
      const { body: user } = await signUp('Ana', 'ana@teste.com');
      validPayload = { sub: user.id, email: user.email, role: user.role };
    });

    it('recusa requisição sem cabeçalho Authorization', async () => {
      await http().get('/users/me').expect(401);
    });

    it.each(['Token abc', 'Bearer', 'Bearer '])(
      'recusa cabeçalho malformado "%s"',
      async (header) => {
        await http().get('/users/me').set('Authorization', header).expect(401);
      },
    );

    it('recusa token assinado com outro segredo', async () => {
      const forged = new JwtService({ secret: 'outro-segredo' }).sign(
        validPayload,
      );

      await me(forged).expect(401);
    });

    it('recusa token com alg none', async () => {
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
        ...validPayload,
        iat: now,
        exp: now + 900,
      })}.`;

      await me(unsigned).expect(401);
    });

    it('recusa token expirado', async () => {
      const now = Math.floor(Date.now() / 1000);
      const expired = new JwtService({
        secret: process.env.JWT_ACCESS_SECRET,
      }).sign({ ...validPayload, iat: now - 1000, exp: now - 100 });

      await me(expired).expect(401);
    });

    it('mantém POST /users público', async () => {
      await http()
        .post('/users')
        .send({ name: 'Bia', email: 'bia@teste.com', password: PASSWORD })
        .expect(201);
    });
  });

  describe('Rotação de refresh token', () => {
    beforeEach(async () => {
      await signUp('Ana', 'ana@teste.com');
    });

    it('troca R1 por um novo par e o novo access token é aceito', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');

      const res = await refresh(r1).expect(200);

      expect(Object.keys(res.body).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
      expect(res.body.refreshToken).not.toBe(r1);
      await me(res.body.accessToken).expect(200);
    });

    it('R2 continua a cadeia gerando R3', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');
      const r2 = (await refresh(r1).expect(200)).body.refreshToken;

      const r3 = (await refresh(r2).expect(200)).body.refreshToken;

      expect(r3).not.toBe(r1);
      expect(r3).not.toBe(r2);
    });

    it('recusa token nunca emitido', async () => {
      await refresh('valor-que-nunca-foi-emitido').expect(401);
    });

    it('recusa token expirado sem revogar as outras sessões', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');
      const { refreshToken: s1 } = await login('ana@teste.com');
      await prisma.refreshToken.update({
        where: { tokenHash: hashRefreshToken(r1) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      await refresh(r1).expect(401);
      await refresh(s1).expect(200);
    });

    it('rejeita corpo vazio com 400 citando refreshToken', async () => {
      const res = await http().post('/auth/refresh').send({}).expect(400);

      expectFieldError(res.body, 'refreshToken');
    });
  });

  describe('Detecção de reutilização de refresh token', () => {
    beforeEach(async () => {
      await signUp('Ana', 'ana@teste.com');
    });

    it('reapresentar R1 após a rotação revoga também R2', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');
      const r2 = (await refresh(r1).expect(200)).body.refreshToken;

      await refresh(r1).expect(401);
      await refresh(r2).expect(401);
    });

    it('revoga todas as sessões do usuário, mas não as de outros', async () => {
      await signUp('Bia', 'bia@teste.com');
      const { refreshToken: r1 } = await login('ana@teste.com');
      const { refreshToken: s1 } = await login('ana@teste.com');
      const { refreshToken: b1 } = await login('bia@teste.com');
      const r2 = (await refresh(r1).expect(200)).body.refreshToken;

      await refresh(r1).expect(401);

      await refresh(r2).expect(401);
      await refresh(s1).expect(401);
      await refresh(b1).expect(200);
    });

    it('requisições simultâneas com o mesmo token contam como reutilização', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');

      const responses = await Promise.all([refresh(r1), refresh(r1)]);

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses).toEqual([200, 401]);
      const winner = responses.find((res) => res.status === 200)!;
      await refresh(winner.body.refreshToken).expect(401);
    });
  });

  describe('Logout', () => {
    let ana: TokenPair;

    beforeEach(async () => {
      await signUp('Ana', 'ana@teste.com');
      ana = await login('ana@teste.com');
    });

    const logout = (accessToken: string, refreshToken: unknown) =>
      http()
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(refreshToken === undefined ? {} : { refreshToken });

    it('revoga o próprio token e responde 204 sem corpo', async () => {
      const res = await logout(ana.accessToken, ana.refreshToken).expect(204);

      expect(res.text).toBe('');
      await refresh(ana.refreshToken).expect(401);
    });

    it('token de outro usuário responde 204 e continua válido', async () => {
      await signUp('Bia', 'bia@teste.com');
      const bia = await login('bia@teste.com');

      await logout(ana.accessToken, bia.refreshToken).expect(204);

      await refresh(bia.refreshToken).expect(200);
    });

    it('token inexistente responde 204', async () => {
      await logout(ana.accessToken, 'valor-que-nunca-foi-emitido').expect(204);
    });

    it('sem autenticação responde 401 e o token continua válido', async () => {
      await http()
        .post('/auth/logout')
        .send({ refreshToken: ana.refreshToken })
        .expect(401);

      await refresh(ana.refreshToken).expect(200);
    });

    it('rejeita corpo vazio com 400 citando refreshToken', async () => {
      const res = await logout(ana.accessToken, undefined).expect(400);

      expectFieldError(res.body, 'refreshToken');
    });
  });

  describe('Proteção dos refresh tokens', () => {
    beforeEach(async () => {
      await signUp('Ana', 'ana@teste.com');
    });

    it('não armazena o refresh token em texto puro', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');

      const rows = await prisma.refreshToken.findMany({
        where: { user: { email: 'ana@teste.com' } },
      });

      expect(rows).toHaveLength(1);
      expect(Object.values(rows[0]).map(String)).not.toContain(r1);
    });

    it('o refresh token é opaco (não é JWT)', async () => {
      const { refreshToken: r1 } = await login('ana@teste.com');

      expect(r1.split('.')).toHaveLength(1);
    });

    it('respostas 401 não ecoam o token nem a senha', async () => {
      const token = 'token-desconhecido-abc123';

      const refreshRes = await refresh(token).expect(401);
      const loginRes = await http()
        .post('/auth/login')
        .send({ email: 'ana@teste.com', password: 'senha-errada-000' })
        .expect(401);

      expect(JSON.stringify(refreshRes.body)).not.toContain(token);
      expect(JSON.stringify(loginRes.body)).not.toContain('senha-errada-000');
    });
  });
});
