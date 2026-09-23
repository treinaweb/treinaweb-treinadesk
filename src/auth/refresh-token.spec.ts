import { generateRefreshToken, hashRefreshToken } from './refresh-token';

describe('refresh-token', () => {
  describe('generateRefreshToken', () => {
    it('gera um valor base64url de 86 caracteres sem ponto', () => {
      const token = generateRefreshToken();

      expect(token).toHaveLength(86);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('gera valores distintos a cada chamada', () => {
      const tokens = new Set(
        Array.from({ length: 50 }, () => generateRefreshToken()),
      );

      expect(tokens.size).toBe(50);
    });
  });

  describe('hashRefreshToken', () => {
    it('é determinístico e retorna 64 caracteres hex', () => {
      const token = generateRefreshToken();

      const hash = hashRefreshToken(token);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hashRefreshToken(token)).toBe(hash);
    });

    it('difere do valor original e de outros tokens', () => {
      const token = generateRefreshToken();

      expect(hashRefreshToken(token)).not.toBe(token);
      expect(hashRefreshToken(token)).not.toBe(
        hashRefreshToken(generateRefreshToken()),
      );
    });
  });
});
