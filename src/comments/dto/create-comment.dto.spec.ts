import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from './create-comment.dto.js';

async function parse(plain: Record<string, unknown>) {
  const dto = plainToInstance(CreateCommentDto, plain);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return { dto, invalid: errors.map((error) => error.property) };
}

describe('CreateCommentDto', () => {
  it('aceita um comentário sem isInternal', async () => {
    const { dto, invalid } = await parse({ body: 'Segue o comprovante' });
    expect(invalid).toEqual([]);
    expect(dto.isInternal).toBeUndefined();
  });

  it.each([true, false])('aceita isInternal %s', async (isInternal) => {
    const { dto, invalid } = await parse({
      body: 'Cliente já pediu estorno antes',
      isInternal,
    });
    expect(invalid).toEqual([]);
    expect(dto.isInternal).toBe(isInternal);
  });

  it('remove os espaços nas extremidades antes de validar', async () => {
    const { dto, invalid } = await parse({ body: '  Segue o comprovante  ' });
    expect(invalid).toEqual([]);
    expect(dto.body).toBe('Segue o comprovante');
  });

  it.each([1, 5000])('aceita body de %i caracteres', async (length) => {
    expect((await parse({ body: 'a'.repeat(length) })).invalid).toEqual([]);
  });

  it('aceita 5000 caracteres depois do trim', async () => {
    const { invalid } = await parse({ body: `  ${'a'.repeat(5000)}  ` });
    expect(invalid).toEqual([]);
  });

  it.each([
    ['ausente', {}],
    ['vazio', { body: '' }],
    ['só com espaços', { body: '     ' }],
    ['com 5001 caracteres', { body: 'a'.repeat(5001) }],
    ['que não é texto', { body: 123 }],
  ])('recusa body %s', async (_, plain) => {
    expect((await parse(plain)).invalid).toEqual(['body']);
  });

  it.each(['sim', 'true', 1])('recusa isInternal %p', async (isInternal) => {
    const { invalid } = await parse({
      body: 'Segue o comprovante',
      isInternal,
    });
    expect(invalid).toEqual(['isInternal']);
  });

  it.each(['authorId', 'ticketId', 'createdAt'])(
    'recusa %s no corpo',
    async (property) => {
      const { invalid } = await parse({
        body: 'Segue o comprovante',
        [property]: 'b0000000-0000-4000-8000-000000000000',
      });
      expect(invalid).toEqual([property]);
    },
  );
});
