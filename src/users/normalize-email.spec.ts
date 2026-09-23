import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('remove espaços das extremidades e converte para minúsculas', () => {
    expect(normalizeEmail('  Ana@Teste.COM  ')).toBe('ana@teste.com');
  });

  it('mantém inalterado um e-mail já normalizado', () => {
    expect(normalizeEmail('ana@teste.com')).toBe('ana@teste.com');
  });

  it('preserva valores que não são string para a validação rejeitar', () => {
    expect(normalizeEmail(123)).toBe(123);
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeNull();
  });
});
