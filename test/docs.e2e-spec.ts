import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupOpenApi } from './../src/openapi/setup-openapi.js';
import { userSummarySelect } from './../src/tickets/ticket-select.js';

type Schema = {
  $ref?: string;
  allOf?: Schema[];
  oneOf?: Schema[];
  type?: string;
  format?: string;
  enum?: string[];
  required?: string[];
  minLength?: number;
  maxLength?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
};

type Operation = {
  description?: string;
  security?: Record<string, string[]>[];
  parameters?: { name: string; in: string }[];
  requestBody?: { content: Record<string, { schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
};

type OpenApiDocument = {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, Operation>>;
  components: {
    schemas: Record<string, Schema>;
    securitySchemes: Record<string, Record<string, string>>;
  };
};

const PUBLIC_OPERATIONS = ['POST /users', 'POST /auth/login', 'POST /auth/refresh'];

const ALL_OPERATIONS = [
  'POST /users',
  'POST /users/staff',
  'GET /users',
  'GET /users/me',
  'PATCH /users/{id}/role',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /categories',
  'POST /categories',
  'PATCH /categories/{id}',
  'POST /tickets',
  'GET /tickets',
  'GET /tickets/{id}',
  'PATCH /tickets/{id}/assign',
  'PATCH /tickets/{id}/status',
  'POST /tickets/{ticketId}/comments',
  'GET /tickets/{ticketId}/comments',
  'GET /',
];

describe('API docs (e2e)', () => {
  let app: INestApplication<App>;
  let doc: OpenApiDocument;
  const originalNodeEnv = process.env.NODE_ENV;

  const createApp = async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const instance =
      moduleFixture.createNestApplication<INestApplication<App>>();
    setupOpenApi(instance);
    await instance.init();
    return instance;
  };

  // Segue $ref e junta allOf/oneOf, para inspecionar o schema efetivo.
  const resolve = (schema: Schema): Schema => {
    if (schema.$ref) {
      const name = schema.$ref.replace('#/components/schemas/', '');
      return resolve(doc.components.schemas[name]);
    }
    const parts = schema.allOf ?? schema.oneOf;
    if (parts) {
      return parts.map(resolve).reduce<Schema>(
        (acc, part) => ({
          ...acc,
          ...part,
          properties: { ...acc.properties, ...part.properties },
          required: [...(acc.required ?? []), ...(part.required ?? [])],
        }),
        {},
      );
    }
    return schema;
  };

  const operation = (key: string): Operation => {
    const [method, path] = key.split(' ');
    const op = doc.paths[path]?.[method.toLowerCase()];
    if (!op) throw new Error(`Operação ausente no documento: ${key}`);
    return op;
  };

  const responseSchema = (key: string, status: string): Schema =>
    resolve(operation(key).responses[status].content!['application/json'].schema);

  const operationKeys = () =>
    Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`),
    );

  const usesBearer = (op: Operation) =>
    (op.security ?? []).some((requirement) => 'bearer' in requirement);

  beforeAll(async () => {
    app = await createApp();
    const res = await request(app.getHttpServer()).get('/docs-json').expect(200);
    doc = res.body;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('Documentação navegável pública', () => {
    it('GET /docs sem token responde 200 com HTML', async () => {
      const res = await request(app.getHttpServer()).get('/docs').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
    });

    it('GET /docs responde 200 com NODE_ENV=production', async () => {
      process.env.NODE_ENV = 'production';
      const prodApp = await createApp();
      try {
        await request(prodApp.getHttpServer()).get('/docs').expect(200);
      } finally {
        await prodApp.close();
      }
    });
  });

  describe('Documento OpenAPI público', () => {
    it('GET /docs-json sem token responde 200 com OpenAPI 3', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body.openapi).toMatch(/^3\./);
      expect(res.body.info.title).toBe('TreinaDesk API');
    });

    it('lista exatamente as rotas da API', () => {
      expect(operationKeys().sort()).toEqual([...ALL_OPERATIONS].sort());
      expect(doc.paths).not.toHaveProperty('/docs');
      expect(doc.paths).not.toHaveProperty('/docs-json');
    });
  });

  describe('Autenticação descrita no documento OpenAPI', () => {
    it('declara o esquema Bearer JWT', () => {
      expect(doc.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      });
    });

    it('toda rota protegida usa o esquema Bearer e lista 401', () => {
      const protectedKeys = operationKeys().filter(
        (key) => !PUBLIC_OPERATIONS.includes(key),
      );
      for (const key of protectedKeys) {
        const op = operation(key);
        expect({ key, bearer: usesBearer(op) }).toEqual({ key, bearer: true });
        expect({ key, statuses: Object.keys(op.responses) }).toEqual({
          key,
          statuses: expect.arrayContaining(['401']),
        });
      }
    });

    it('rotas públicas não usam o esquema Bearer', () => {
      for (const key of PUBLIC_OPERATIONS) {
        expect({ key, bearer: usesBearer(operation(key)) }).toEqual({
          key,
          bearer: false,
        });
      }
    });

    it('rota restrita por papel lista 401 e 403 e informa o papel', () => {
      const op = operation('POST /categories');
      expect(Object.keys(op.responses)).toEqual(
        expect.arrayContaining(['401', '403']),
      );
      expect(op.description).toContain('ADMIN');
    });
  });

  describe('Corpos de requisição e respostas descritos', () => {
    it('descreve o corpo e as respostas de POST /tickets', () => {
      const op = operation('POST /tickets');
      const body = resolve(op.requestBody!.content['application/json'].schema);
      expect(body.required).toEqual(
        expect.arrayContaining(['title', 'description', 'priority', 'categoryId']),
      );
      expect(body.properties!.title).toMatchObject({ minLength: 5, maxLength: 120 });
      expect(body.properties!.description).toMatchObject({
        minLength: 10,
        maxLength: 5000,
      });
      expect(resolve(body.properties!.priority).enum).toEqual([
        'LOW',
        'MEDIUM',
        'HIGH',
        'URGENT',
      ]);
      expect(body.properties!.categoryId).toMatchObject({ format: 'uuid' });
      expect(Object.keys(op.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '422']),
      );
    });

    it('descreve a resposta de login', () => {
      const schema = responseSchema('POST /auth/login', '200');
      expect(schema.properties!.accessToken).toMatchObject({ type: 'string' });
      expect(schema.properties!.refreshToken).toMatchObject({ type: 'string' });
      expect(Object.keys(operation('POST /auth/login').responses)).toContain('401');
    });

    it('descreve o ticket sem dados sensíveis do usuário', () => {
      const ticket = responseSchema('GET /tickets/{id}', '200');
      const summaryKeys = Object.keys(userSummarySelect).sort();
      for (const field of ['customer', 'assignee']) {
        const user = resolve(ticket.properties![field]);
        expect({ field, keys: Object.keys(user.properties!).sort() }).toEqual({
          field,
          keys: summaryKeys,
        });
      }
      expect(JSON.stringify(doc.components.schemas)).not.toContain('passwordHash');
    });

    it('descreve a listagem paginada de tickets', () => {
      const page = responseSchema('GET /tickets', '200');
      expect(Object.keys(page.properties!)).toEqual(
        expect.arrayContaining(['data', 'page', 'limit', 'total']),
      );
      expect(page.properties!.data.type).toBe('array');
      const params = (operation('GET /tickets').parameters ?? []).map((p) => p.name);
      expect(params).toEqual(
        expect.arrayContaining(['page', 'limit', 'status', 'priority']),
      );
    });

    it('usa o status de sucesso real de cada rota', () => {
      expect(Object.keys(operation('POST /auth/logout').responses)).toContain('204');
      expect(Object.keys(operation('POST /auth/login').responses)).toContain('200');
      expect(Object.keys(operation('POST /users').responses)).toContain('201');
    });
  });

  describe('Comportamento das rotas existentes preservado', () => {
    it('GET /tickets sem token continua 401', () => {
      return request(app.getHttpServer()).get('/tickets').expect(401);
    });

    it('GET / sem token continua 401', () => {
      return request(app.getHttpServer()).get('/').expect(401);
    });
  });
});
