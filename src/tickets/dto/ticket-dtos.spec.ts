import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AssignTicketDto } from './assign-ticket.dto.js';
import { CreateTicketDto } from './create-ticket.dto.js';
import { ListTicketsQueryDto } from './list-tickets-query.dto.js';
import { UpdateStatusDto } from './update-status.dto.js';

async function parse<T extends object>(
  cls: new () => T,
  plain: Record<string, unknown>,
) {
  const dto = plainToInstance(cls, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, invalid: errors.map((error) => error.property) };
}

describe('CreateTicketDto', () => {
  const valid = {
    title: 'Cobrança duplicada',
    description: 'Fui cobrada duas vezes na fatura de março.',
    priority: 'HIGH',
    categoryId: 'c0000000-0000-4000-8000-000000000000',
  };

  it('aceita um corpo válido', async () => {
    expect((await parse(CreateTicketDto, valid)).invalid).toEqual([]);
  });

  it('aceita os limites 5/120 e 10/5000', async () => {
    for (const [title, description] of [
      ['a'.repeat(5), 'b'.repeat(10)],
      ['a'.repeat(120), 'b'.repeat(5000)],
    ]) {
      const { invalid } = await parse(CreateTicketDto, {
        ...valid,
        title,
        description,
      });
      expect(invalid).toEqual([]);
    }
  });

  it('recusa title com 4 ou 121 caracteres', async () => {
    for (const title of ['a'.repeat(4), 'a'.repeat(121)]) {
      const { invalid } = await parse(CreateTicketDto, { ...valid, title });
      expect(invalid).toEqual(['title']);
    }
  });

  it('recusa description com 9 ou 5001 caracteres', async () => {
    for (const description of ['b'.repeat(9), 'b'.repeat(5001)]) {
      const { invalid } = await parse(CreateTicketDto, {
        ...valid,
        description,
      });
      expect(invalid).toEqual(['description']);
    }
  });

  it('remove espaços nas extremidades antes de validar', async () => {
    const { dto, invalid } = await parse(CreateTicketDto, {
      ...valid,
      title: '  Cobrança duplicada  ',
    });
    expect(invalid).toEqual([]);
    expect(dto.title).toBe('Cobrança duplicada');

    const short = await parse(CreateTicketDto, { ...valid, title: '  Erro  ' });
    expect(short.invalid).toEqual(['title']);
  });

  it('recusa priority fora do enum e categoryId que não é UUID', async () => {
    expect(
      (await parse(CreateTicketDto, { ...valid, priority: 'CRITICAL' }))
        .invalid,
    ).toEqual(['priority']);
    expect(
      (await parse(CreateTicketDto, { ...valid, categoryId: 'abc' })).invalid,
    ).toEqual(['categoryId']);
  });

  it('recusa campos obrigatórios ausentes', async () => {
    const { invalid } = await parse(CreateTicketDto, {});
    expect(invalid.sort()).toEqual(
      ['categoryId', 'description', 'priority', 'title'].sort(),
    );
  });

  it.each(['customerId', 'status', 'assigneeId'])(
    'recusa a propriedade %s',
    async (property) => {
      const { invalid } = await parse(CreateTicketDto, {
        ...valid,
        [property]: 'x',
      });
      expect(invalid).toEqual([property]);
    },
  );
});

describe('ListTicketsQueryDto', () => {
  it('aplica os padrões page 1 e limit 20', async () => {
    const { dto, invalid } = await parse(ListTicketsQueryDto, {});
    expect(invalid).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('aceita limit=50 e filtros válidos', async () => {
    const { dto, invalid } = await parse(ListTicketsQueryDto, {
      limit: '50',
      status: 'OPEN',
      priority: 'HIGH',
    });
    expect(invalid).toEqual([]);
    expect(dto.limit).toBe(50);
  });

  it('recusa limit=51', async () => {
    expect((await parse(ListTicketsQueryDto, { limit: '51' })).invalid).toEqual(
      ['limit'],
    );
  });

  it('recusa status e priority inexistentes', async () => {
    expect(
      (await parse(ListTicketsQueryDto, { status: 'PENDING' })).invalid,
    ).toEqual(['status']);
    expect(
      (await parse(ListTicketsQueryDto, { priority: 'CRITICAL' })).invalid,
    ).toEqual(['priority']);
  });
});

describe('UpdateStatusDto', () => {
  it('aceita um status existente', async () => {
    expect(
      (await parse(UpdateStatusDto, { status: 'CLOSED' })).invalid,
    ).toEqual([]);
  });

  it('recusa status inexistente ou ausente', async () => {
    expect(
      (await parse(UpdateStatusDto, { status: 'CANCELED' })).invalid,
    ).toEqual(['status']);
    expect((await parse(UpdateStatusDto, {})).invalid).toEqual(['status']);
  });
});

describe('AssignTicketDto', () => {
  it('aceita corpo vazio e assigneeId UUID', async () => {
    expect((await parse(AssignTicketDto, {})).invalid).toEqual([]);
    expect(
      (
        await parse(AssignTicketDto, {
          assigneeId: 'a0000000-0000-4000-8000-000000000000',
        })
      ).invalid,
    ).toEqual([]);
  });

  it('recusa assigneeId que não é UUID', async () => {
    expect(
      (await parse(AssignTicketDto, { assigneeId: 'abc' })).invalid,
    ).toEqual(['assigneeId']);
  });
});
