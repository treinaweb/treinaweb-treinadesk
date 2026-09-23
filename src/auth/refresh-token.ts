import { createHash, randomBytes } from 'node:crypto';

// Valor opaco de 512 bits entregue ao cliente; nunca é persistido nem logado.
export function generateRefreshToken(): string {
  return randomBytes(64).toString('base64url');
}

// SHA-256 basta: o token tem alta entropia, e o hash determinístico permite
// buscar o registro por índice único (argon2, com salt aleatório, não permite).
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
