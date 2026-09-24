import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

async function parse(query: Record<string, string>) {
  const dto = plainToInstance(PaginationQueryDto, query);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, invalid: errors.map((error) => error.property) };
}

describe('PaginationQueryDto', () => {
  it('aplica os padrões page 1 e limit 20', async () => {
    const { dto, invalid } = await parse({});

    expect(invalid).toEqual([]);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('converte strings da query em números', async () => {
    const { dto, invalid } = await parse({ page: '2', limit: '100' });

    expect(invalid).toEqual([]);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(100);
  });

  it.each([
    ['limit', '101'],
    ['limit', '0'],
    ['limit', '2.5'],
    ['page', '0'],
    ['page', 'abc'],
  ])('rejeita %s=%s', async (field, value) => {
    const { invalid } = await parse({ [field]: value });

    expect(invalid).toEqual([field]);
  });
});
