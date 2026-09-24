import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { seedAdmin } from './../src/users/seed-admin';

describe('Seed do administrador (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const env = {
    ADMIN_EMAIL: '  Admin@TreinaDesk.com ',
    ADMIN_PASSWORD: 'adminSenha123',
  };

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

  it('cria o administrador com e-mail normalizado e hash argon2id', async () => {
    await seedAdmin(prisma, env);

    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@treinadesk.com' },
    });
    expect(admin.role).toBe('ADMIN');
    expect(admin.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(admin.passwordHash, env.ADMIN_PASSWORD)).toBe(
      true,
    );
  });

  it('é idempotente quando executado novamente', async () => {
    await seedAdmin(prisma, env);
    await expect(seedAdmin(prisma, env)).resolves.not.toThrow();

    expect(
      await prisma.user.count({ where: { email: 'admin@treinadesk.com' } }),
    ).toBe(1);
  });

  it.each(['ADMIN_EMAIL', 'ADMIN_PASSWORD'])(
    'falha citando %s quando ausente e não cria usuário',
    async (variable) => {
      const incomplete = { ...env, [variable]: undefined };

      await expect(seedAdmin(prisma, incomplete)).rejects.toThrow(variable);
      expect(await prisma.user.count()).toBe(0);
    },
  );

  it('torna o e-mail do administrador indisponível para cadastro público', async () => {
    await seedAdmin(prisma, env);

    await request(app.getHttpServer())
      .post('/users')
      .send({
        name: 'Impostor',
        email: 'ADMIN@treinadesk.com',
        password: 'senhaSegura123',
      })
      .expect(409);
  });
});
