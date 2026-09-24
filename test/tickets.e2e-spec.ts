import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as argon2 from 'argon2';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import {
  Role,
  TicketPriority,
  TicketStatus,
} from './../src/generated/prisma/client';
import { PrismaService } from './../src/prisma/prisma.service';

const PASSWORD = 'senha-forte-123';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const TICKET_KEYS = [
  'assignee',
  'category',
  'closedAt',
  'createdAt',
  'customer',
  'description',
  'id',
  'priority',
  'status',
  'title',
  'updatedAt',
];

function expectFieldError(body: { message: string[] }, field: string) {
  expect(body.message).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        new RegExp(`^(${field} |property ${field} should not exist)`),
      ),
    ]),
  );
}

describe('Tickets (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Cliente A e B, atendentes S1 e S2 e o administrador.
  const users = {} as Record<'A' | 'B' | 'S1' | 'S2' | 'ADM', { id: string }>;
  let TA: string;
  let TB: string;
  let TS1: string;
  let TS2: string;
  let TADM: string;
  let financeiroId: string;
  let legadoId: string;

  const createUser = async (name: string, email: string, role: Role) =>
    prisma.user.create({
      data: {
        name,
        email,
        role,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      },
      select: { id: true },
    });

  const login = async (email: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body.accessToken;
  };

  const as = (accessToken?: string) => {
    const auth = <T extends request.Test>(req: T) =>
      accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
    return {
      get: (url: string) => auth(request(app.getHttpServer()).get(url)),
      post: (url: string, body: object) =>
        auth(request(app.getHttpServer()).post(url)).send(body),
      patch: (url: string, body?: object) => {
        const req = auth(request(app.getHttpServer()).patch(url));
        return body === undefined ? req : req.send(body);
      },
    };
  };

  const validBody = () => ({
    title: 'Cobrança duplicada',
    description: 'Fui cobrada duas vezes na fatura de março.',
    priority: 'HIGH',
    categoryId: financeiroId,
  });

  // Cria o ticket direto no banco, no estado desejado.
  const createTicket = (
    options: {
      title?: string;
      customer?: { id: string };
      status?: TicketStatus;
      priority?: TicketPriority;
      assignee?: { id: string } | null;
      createdAt?: Date;
    } = {},
  ) =>
    prisma.ticket.create({
      data: {
        title: options.title ?? 'Cobrança duplicada',
        description: 'Fui cobrada duas vezes na fatura de março.',
        priority: options.priority ?? TicketPriority.HIGH,
        status: options.status ?? TicketStatus.OPEN,
        categoryId: financeiroId,
        customerId: (options.customer ?? users.A).id,
        assigneeId: options.assignee?.id ?? null,
        closedAt: options.status === TicketStatus.CLOSED ? new Date() : null,
        createdAt: options.createdAt,
      },
    });

  const stored = (id: string) =>
    prisma.ticket.findUniqueOrThrow({ where: { id } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();

    users.A = await createUser('Ana', 'ana@teste.com', Role.CUSTOMER);
    users.B = await createUser('Bruno', 'bruno@teste.com', Role.CUSTOMER);
    users.S1 = await createUser('Bia', 'bia@teste.com', Role.SUPPORT);
    users.S2 = await createUser('Carla', 'carla@teste.com', Role.SUPPORT);
    users.ADM = await createUser('Diego', 'diego@teste.com', Role.ADMIN);
    TA = await login('ana@teste.com');
    TB = await login('bruno@teste.com');
    TS1 = await login('bia@teste.com');
    TS2 = await login('carla@teste.com');
    TADM = await login('diego@teste.com');

    financeiroId = (
      await prisma.category.create({ data: { name: 'Financeiro' } })
    ).id;
    legadoId = (
      await prisma.category.create({ data: { name: 'Legado', active: false } })
    ).id;
  });

  beforeEach(async () => {
    await prisma.ticket.deleteMany();
  });

  afterAll(async () => {
    await prisma.ticket.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe('Abertura de ticket pelo cliente', () => {
    it('cliente abre ticket OPEN, sem atendente, com ele como customer', async () => {
      const res = await as(TA).post('/tickets', validBody()).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(TICKET_KEYS);
      expect(res.body).toMatchObject({
        title: 'Cobrança duplicada',
        status: 'OPEN',
        priority: 'HIGH',
        category: { id: financeiroId, name: 'Financeiro' },
        customer: { id: users.A.id, name: 'Ana', role: 'CUSTOMER' },
        assignee: null,
        closedAt: null,
      });
    });

    it('remove espaços nas extremidades do título', async () => {
      const res = await as(TA)
        .post('/tickets', { ...validBody(), title: '  Cobrança duplicada  ' })
        .expect(201);

      expect(res.body.title).toBe('Cobrança duplicada');
    });

    it('título curto demais → 400 e nada é criado', async () => {
      const res = await as(TA)
        .post('/tickets', { ...validBody(), title: 'Erro' })
        .expect(400);

      expectFieldError(res.body, 'title');
      expect(await prisma.ticket.count()).toBe(0);
    });

    it('aceita os limites de tamanho', async () => {
      await as(TA)
        .post('/tickets', {
          ...validBody(),
          title: 'a'.repeat(5),
          description: 'b'.repeat(10),
        })
        .expect(201);
      await as(TA)
        .post('/tickets', {
          ...validBody(),
          title: 'a'.repeat(120),
          description: 'b'.repeat(5000),
        })
        .expect(201);
    });

    it('tamanhos acima do limite → 400', async () => {
      const title = await as(TA)
        .post('/tickets', { ...validBody(), title: 'a'.repeat(121) })
        .expect(400);
      expectFieldError(title.body, 'title');

      const description = await as(TA)
        .post('/tickets', { ...validBody(), description: 'b'.repeat(5001) })
        .expect(400);
      expectFieldError(description.body, 'description');

      expect(await prisma.ticket.count()).toBe(0);
    });

    it('prioridade inválida ou campo ausente → 400', async () => {
      const priority = await as(TA)
        .post('/tickets', { ...validBody(), priority: 'CRITICAL' })
        .expect(400);
      expectFieldError(priority.body, 'priority');

      const { description: _description, ...withoutDescription } = validBody();
      const missing = await as(TA)
        .post('/tickets', withoutDescription)
        .expect(400);
      expectFieldError(missing.body, 'description');
    });

    it('categoria inativa e inexistente → 422 com a mesma mensagem', async () => {
      const inactive = await as(TA)
        .post('/tickets', { ...validBody(), categoryId: legadoId })
        .expect(422);
      const missing = await as(TA)
        .post('/tickets', { ...validBody(), categoryId: MISSING_ID })
        .expect(422);

      expect(missing.body.message).toBe(inactive.body.message);
      expect(await prisma.ticket.count()).toBe(0);
    });

    it.each([
      ['customerId', () => users.B.id],
      ['status', () => 'CLOSED'],
      ['assigneeId', () => users.S1.id],
    ])('%s no corpo → 400 e nada é criado', async (property, value) => {
      const res = await as(TA)
        .post('/tickets', { ...validBody(), [property]: value() })
        .expect(400);

      expectFieldError(res.body, property);
      expect(await prisma.ticket.count()).toBe(0);
    });

    it('atendente e administrador → 403', async () => {
      await as(TS1).post('/tickets', validBody()).expect(403);
      await as(TADM).post('/tickets', validBody()).expect(403);
      expect(await prisma.ticket.count()).toBe(0);
    });

    it('sem autenticação → 401', async () => {
      await as().post('/tickets', validBody()).expect(401);
    });
  });

  describe('Visibilidade e consulta por id', () => {
    it('cliente consulta o próprio ticket', async () => {
      const t = await createTicket();

      const res = await as(TA).get(`/tickets/${t.id}`).expect(200);

      expect(res.body.id).toBe(t.id);
      expect(res.body.title).toBe('Cobrança duplicada');
    });

    it('cliente B não vê ticket de A: 404 igual a inexistente, sem vazar dados', async () => {
      const t = await createTicket();

      const other = await as(TB).get(`/tickets/${t.id}`).expect(404);
      const missing = await as(TB).get(`/tickets/${MISSING_ID}`).expect(404);

      expect(other.body).toEqual(missing.body);
      expect(JSON.stringify(other.body)).not.toContain('Cobrança duplicada');
      expect(JSON.stringify(other.body)).not.toContain('Fui cobrada');
    });

    it('atendente vê ticket da fila', async () => {
      const t = await createTicket();

      await as(TS1).get(`/tickets/${t.id}`).expect(200);
    });

    it('atendente não vê ticket atribuído a outro', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      await as(TS2).get(`/tickets/${t.id}`).expect(404);
    });

    it('atendente perde a visibilidade ao ser substituído', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });
      await as(TS1).get(`/tickets/${t.id}`).expect(200);

      await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S2.id })
        .expect(200);

      await as(TS1).get(`/tickets/${t.id}`).expect(404);
    });

    it('administrador vê qualquer ticket', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      await as(TADM).get(`/tickets/${t.id}`).expect(200);
    });

    it('alteração de status em ticket alheio → 404 e nada muda', async () => {
      const t = await createTicket();

      await as(TB)
        .patch(`/tickets/${t.id}/status`, { status: 'CLOSED' })
        .expect(404);

      expect((await stored(t.id)).status).toBe('OPEN');
    });

    it('id inválido → 400', async () => {
      await as(TA).get('/tickets/abc').expect(400);
    });
  });

  describe('Listagem de tickets', () => {
    const titles = (body: { data: { title: string }[] }) =>
      body.data.map((t) => t.title);

    it('cliente lista só os próprios, do mais recente ao mais antigo', async () => {
      await createTicket({
        title: 'Senha expirada',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      await createTicket({
        title: 'Cobrança duplicada',
        createdAt: new Date('2026-01-02T10:00:00Z'),
      });
      await createTicket({ title: 'Nota fiscal errada', customer: users.B });

      const res = await as(TA).get('/tickets').expect(200);

      expect(res.body).toMatchObject({ page: 1, limit: 20, total: 2 });
      expect(titles(res.body)).toEqual([
        'Cobrança duplicada',
        'Senha expirada',
      ]);
    });

    describe('com T1 da fila, T2 de S1, T3 de S2 e T4 fechado', () => {
      beforeEach(async () => {
        await createTicket({ title: 'T1 fila' });
        await createTicket({
          title: 'T2 de S1',
          status: TicketStatus.IN_PROGRESS,
          assignee: users.S1,
        });
        await createTicket({
          title: 'T3 de S2',
          status: TicketStatus.IN_PROGRESS,
          assignee: users.S2,
        });
        await createTicket({
          title: 'T4 fechado',
          status: TicketStatus.CLOSED,
        });
      });

      it('atendente lista a fila e os próprios', async () => {
        const res = await as(TS1).get('/tickets').expect(200);

        expect(titles(res.body).sort()).toEqual(['T1 fila', 'T2 de S1']);
        expect(res.body.total).toBe(2);
      });

      it('administrador lista todos', async () => {
        const res = await as(TADM).get('/tickets').expect(200);

        expect(res.body.total).toBe(4);
      });
    });

    it('filtros combinados com a visibilidade', async () => {
      await createTicket({ title: 'A open high' });
      await createTicket({ title: 'A open low', priority: TicketPriority.LOW });
      await createTicket({
        title: 'A closed high',
        status: TicketStatus.CLOSED,
      });
      await createTicket({ title: 'B open high', customer: users.B });

      const res = await as(TA)
        .get('/tickets?status=OPEN&priority=HIGH')
        .expect(200);

      expect(res.body.total).toBe(1);
      expect(titles(res.body)).toEqual(['A open high']);
    });

    it('total calculado sobre os visíveis filtrados', async () => {
      for (let i = 0; i < 3; i++) await createTicket({ title: `A ${i}` });
      for (let i = 0; i < 5; i++) {
        await createTicket({ title: `B ${i}`, customer: users.B });
      }

      const first = await as(TA)
        .get('/tickets?status=OPEN&page=1&limit=2')
        .expect(200);
      const second = await as(TA)
        .get('/tickets?status=OPEN&page=2&limit=2')
        .expect(200);

      expect(first.body.data).toHaveLength(2);
      expect(first.body.total).toBe(3);
      expect(second.body.data).toHaveLength(1);
      expect(titles(first.body)).not.toContain(titles(second.body)[0]);
    });

    it('limit=50 é aceito e limit=51 → 400', async () => {
      await as(TA).get('/tickets?limit=50').expect(200);
      const res = await as(TA).get('/tickets?limit=51').expect(400);
      expectFieldError(res.body, 'limit');
    });

    it('filtros inválidos → 400', async () => {
      const status = await as(TA).get('/tickets?status=PENDING').expect(400);
      expectFieldError(status.body, 'status');
      const priority = await as(TA)
        .get('/tickets?priority=CRITICAL')
        .expect(400);
      expectFieldError(priority.body, 'priority');
    });

    it('sem autenticação → 401', async () => {
      await as().get('/tickets').expect(401);
    });
  });

  describe('Formato do ticket nas respostas', () => {
    it('customer e assignee só com id, name e role', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      const res = await as(TADM).get(`/tickets/${t.id}`).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(TICKET_KEYS);
      expect(res.body.customer).toEqual({
        id: users.A.id,
        name: 'Ana',
        role: 'CUSTOMER',
      });
      expect(res.body.assignee).toEqual({
        id: users.S1.id,
        name: 'Bia',
        role: 'SUPPORT',
      });
      expect(Object.keys(res.body.category).sort()).toEqual(['id', 'name']);
      expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash/);
    });

    it('itens da listagem no mesmo formato', async () => {
      await createTicket();

      const res = await as(TA).get('/tickets').expect(200);

      expect(Object.keys(res.body.data[0]).sort()).toEqual(TICKET_KEYS);
      expect(res.body.data[0].customer).toEqual({
        id: users.A.id,
        name: 'Ana',
        role: 'CUSTOMER',
      });
      expect(JSON.stringify(res.body)).not.toMatch(/email|passwordHash/);
    });
  });

  describe('Atendente assume ticket da fila', () => {
    it('assume ticket OPEN → IN_PROGRESS com ele como assignee', async () => {
      const t = await createTicket();

      const res = await as(TS1).patch(`/tickets/${t.id}/assign`).expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.assignee).toEqual({
        id: users.S1.id,
        name: 'Bia',
        role: 'SUPPORT',
      });
    });

    it('ticket já atribuído a outro → 404', async () => {
      const t = await createTicket();
      await as(TS1).patch(`/tickets/${t.id}/assign`).expect(200);

      await as(TS2).patch(`/tickets/${t.id}/assign`).expect(404);

      expect((await stored(t.id)).assigneeId).toBe(users.S1.id);
    });

    it('reassumir o próprio ticket → 422', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      await as(TS1).patch(`/tickets/${t.id}/assign`).expect(422);

      const after = await stored(t.id);
      expect(after.status).toBe('IN_PROGRESS');
      expect(after.assigneeId).toBe(users.S1.id);
    });

    it('atendente com assigneeId → 400', async () => {
      const t = await createTicket();

      await as(TS1)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S2.id })
        .expect(400);

      const after = await stored(t.id);
      expect(after.status).toBe('OPEN');
      expect(after.assigneeId).toBeNull();
    });

    it('chamadas simultâneas: exatamente uma vence', async () => {
      for (let round = 0; round < 5; round++) {
        const t = await createTicket({ title: `Concorrência ${round}` });

        const responses = await Promise.all([
          as(TS1).patch(`/tickets/${t.id}/assign`),
          as(TS2).patch(`/tickets/${t.id}/assign`),
        ]);

        const statuses = responses.map((r) => r.status);
        expect(statuses.filter((s) => s === 200)).toHaveLength(1);
        const loser = statuses.find((s) => s !== 200);
        expect([404, 409]).toContain(loser);

        const winner = responses[statuses.indexOf(200)];
        const after = await stored(t.id);
        expect(after.status).toBe('IN_PROGRESS');
        expect(after.assigneeId).toBe(winner.body.assignee.id);
      }
    });

    it('cliente → 403', async () => {
      const t = await createTicket();

      await as(TA).patch(`/tickets/${t.id}/assign`).expect(403);

      expect((await stored(t.id)).assigneeId).toBeNull();
    });
  });

  describe('Administrador atribui ticket a um atendente', () => {
    it('ticket OPEN → IN_PROGRESS com S1', async () => {
      const t = await createTicket();

      const res = await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S1.id })
        .expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.assignee.id).toBe(users.S1.id);
    });

    it('substitui o atendente mantendo WAITING_CUSTOMER', async () => {
      const t = await createTicket({
        status: TicketStatus.WAITING_CUSTOMER,
        assignee: users.S1,
      });

      const res = await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S2.id })
        .expect(200);

      expect(res.body.status).toBe('WAITING_CUSTOMER');
      expect(res.body.assignee.id).toBe(users.S2.id);
    });

    it('destinatário que não é SUPPORT ou inexistente → 422', async () => {
      const t = await createTicket();

      await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.B.id })
        .expect(422);
      await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: MISSING_ID })
        .expect(422);

      const after = await stored(t.id);
      expect(after.status).toBe('OPEN');
      expect(after.assigneeId).toBeNull();
    });

    it('ticket CLOSED → 422', async () => {
      const t = await createTicket({ status: TicketStatus.CLOSED });

      await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S1.id })
        .expect(422);

      const after = await stored(t.id);
      expect(after.status).toBe('CLOSED');
      expect(after.assigneeId).toBeNull();
    });

    it('ticket RESOLVED → 422', async () => {
      const t = await createTicket({
        status: TicketStatus.RESOLVED,
        assignee: users.S1,
      });

      await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: users.S2.id })
        .expect(422);

      expect((await stored(t.id)).assigneeId).toBe(users.S1.id);
    });

    it('sem assigneeId ou assigneeId inválido → 400', async () => {
      const t = await createTicket();

      const missing = await as(TADM)
        .patch(`/tickets/${t.id}/assign`)
        .expect(400);
      expect(JSON.stringify(missing.body.message)).toContain('assigneeId');

      const invalid = await as(TADM)
        .patch(`/tickets/${t.id}/assign`, { assigneeId: 'abc' })
        .expect(400);
      expectFieldError(invalid.body, 'assigneeId');
    });
  });

  describe('Mudança de status do ticket', () => {
    const change = (token: string, id: string, status: string) =>
      as(token).patch(`/tickets/${id}/status`, { status });

    it.each([
      ['S1', 'IN_PROGRESS', 'WAITING_CUSTOMER'],
      ['S1', 'IN_PROGRESS', 'RESOLVED'],
      ['S1', 'WAITING_CUSTOMER', 'RESOLVED'],
      ['ADM', 'IN_PROGRESS', 'WAITING_CUSTOMER'],
      ['ADM', 'IN_PROGRESS', 'RESOLVED'],
      ['ADM', 'WAITING_CUSTOMER', 'RESOLVED'],
    ] as const)('%s: %s → %s → 200 sem closedAt', async (actor, from, to) => {
      const t = await createTicket({ status: from, assignee: users.S1 });

      const res = await change(actor === 'S1' ? TS1 : TADM, t.id, to).expect(
        200,
      );

      expect(res.body.status).toBe(to);
      expect(res.body.closedAt).toBeNull();
    });

    it('cliente reabre ticket resolvido mantendo o atendente', async () => {
      const t = await createTicket({
        status: TicketStatus.RESOLVED,
        assignee: users.S1,
      });

      const res = await change(TA, t.id, 'IN_PROGRESS').expect(200);

      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.assignee.id).toBe(users.S1.id);
      expect(res.body.closedAt).toBeNull();
    });

    it.each([
      ['A', TicketStatus.RESOLVED],
      ['A', TicketStatus.OPEN],
      ['ADM', TicketStatus.RESOLVED],
      ['ADM', TicketStatus.OPEN],
    ] as const)(
      '%s fecha ticket %s → closedAt preenchido',
      async (actor, from) => {
        const t = await createTicket({ status: from });
        const before = Date.now();

        const res = await change(
          actor === 'A' ? TA : TADM,
          t.id,
          'CLOSED',
        ).expect(200);

        expect(res.body.status).toBe('CLOSED');
        expect(new Date(res.body.closedAt).getTime()).toBeGreaterThanOrEqual(
          before - 1000,
        );
      },
    );

    it('OPEN → IN_PROGRESS pela rota de status → 422', async () => {
      const t = await createTicket();

      await change(TADM, t.id, 'IN_PROGRESS').expect(422);

      const after = await stored(t.id);
      expect(after.status).toBe('OPEN');
      expect(after.assigneeId).toBeNull();
    });

    it('status igual ao atual → 422', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      await change(TS1, t.id, 'IN_PROGRESS').expect(422);
    });

    it('ticket CLOSED não muda de status', async () => {
      const t = await createTicket({ status: TicketStatus.CLOSED });

      await change(TA, t.id, 'IN_PROGRESS').expect(422);
      await change(TADM, t.id, 'RESOLVED').expect(422);

      const after = await stored(t.id);
      expect(after.status).toBe('CLOSED');
      expect(after.closedAt).toEqual(t.closedAt);
    });

    it('cliente não resolve o próprio ticket', async () => {
      const t = await createTicket({
        status: TicketStatus.IN_PROGRESS,
        assignee: users.S1,
      });

      await change(TA, t.id, 'RESOLVED').expect(422);

      expect((await stored(t.id)).status).toBe('IN_PROGRESS');
    });

    it('atendente não fecha nem reabre', async () => {
      const t = await createTicket({
        status: TicketStatus.RESOLVED,
        assignee: users.S1,
      });

      await change(TS1, t.id, 'CLOSED').expect(422);
      await change(TS1, t.id, 'IN_PROGRESS').expect(422);

      expect((await stored(t.id)).status).toBe('RESOLVED');
    });

    it('atendente não altera ticket da fila', async () => {
      const t = await createTicket();

      await change(TS1, t.id, 'CLOSED').expect(422);

      expect((await stored(t.id)).status).toBe('OPEN');
    });

    it('administrador não reabre ticket', async () => {
      const t = await createTicket({
        status: TicketStatus.RESOLVED,
        assignee: users.S1,
      });

      await change(TADM, t.id, 'IN_PROGRESS').expect(422);
    });

    it('status inexistente ou ausente → 400', async () => {
      const t = await createTicket();

      const unknown = await change(TA, t.id, 'CANCELED').expect(400);
      expectFieldError(unknown.body, 'status');
      const missing = await as(TA)
        .patch(`/tickets/${t.id}/status`, {})
        .expect(400);
      expectFieldError(missing.body, 'status');

      expect((await stored(t.id)).status).toBe('OPEN');
    });

    it('ticket de outro cliente → 404 e nada muda', async () => {
      const t = await createTicket({ status: TicketStatus.RESOLVED });

      await change(TB, t.id, 'CLOSED').expect(404);

      const after = await stored(t.id);
      expect(after.status).toBe('RESOLVED');
      expect(after.closedAt).toBeNull();
    });
  });
});
