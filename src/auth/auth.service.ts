import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordHasher } from '../users/password-hasher.js';
import { AccessTokenPayload } from './authenticated-user.js';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

type TokenOwner = Pick<AccessTokenPayload, 'email' | 'role'> & { id: string };

type RotationResult =
  { ok: true; user: TokenOwner; refreshToken: string } | { ok: false };

const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function refreshTokenTtlMs(): number {
  const raw = process.env.REFRESH_TOKEN_TTL_DAYS;
  const days = raw ? Number(raw) : DEFAULT_REFRESH_TOKEN_TTL_DAYS;
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error('REFRESH_TOKEN_TTL_DAYS deve ser um inteiro positivo');
  }
  return days * DAY_MS;
}

@Injectable()
export class AuthService {
  // Hash de referência para e-mail inexistente: mantém o custo do argon2
  // nos dois caminhos do login. Calculado uma vez, com as mesmas opções.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHasher,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });

    if (!user) {
      this.dummyHash ??= this.passwordHasher.hash(
        randomBytes(32).toString('hex'),
      );
      await this.passwordHasher.verify(await this.dummyHash, password);
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!(await this.passwordHasher.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const refreshToken = await this.createRefreshToken(this.prisma, user.id);
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
    };
  }

  async refresh(token: string): Promise<TokenPair> {
    const tokenHash = hashRefreshToken(token);

    // Nunca lança dentro da transação: a revogação em massa por reutilização
    // precisa ser comitada mesmo quando a resposta é 401.
    const result = await this.prisma.$transaction(
      async (tx): Promise<RotationResult> => {
        const now = new Date();
        const current = await tx.refreshToken.findUnique({
          where: { tokenHash },
        });
        if (!current) {
          return { ok: false };
        }

        if (current.revokedAt) {
          await this.revokeAllActive(tx, current.userId, now);
          return { ok: false };
        }

        if (current.expiresAt <= now) {
          return { ok: false };
        }

        // Compare-and-set: sob concorrência, só uma transação revoga a linha;
        // a outra espera o lock, obtém count 0 e é tratada como reutilização.
        const claim = await tx.refreshToken.updateMany({
          where: { id: current.id, revokedAt: null },
          data: { revokedAt: now },
        });
        if (claim.count === 0) {
          await this.revokeAllActive(tx, current.userId, now);
          return { ok: false };
        }

        const user = await tx.user.findUniqueOrThrow({
          where: { id: current.userId },
          select: { id: true, email: true, role: true },
        });
        const refreshToken = await this.createRefreshToken(tx, user.id);
        return { ok: true, user, refreshToken };
      },
    );

    if (!result.ok) {
      throw new UnauthorizedException();
    }

    return {
      accessToken: await this.signAccessToken(result.user),
      refreshToken: result.refreshToken,
    };
  }

  // Só revoga token do próprio usuário; o resultado não é exposto.
  async logout(userId: string, token: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(token), userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private signAccessToken(user: TokenOwner): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    return this.jwtService.signAsync(payload);
  }

  private async createRefreshToken(
    db: Prisma.TransactionClient,
    userId: string,
  ): Promise<string> {
    const refreshToken = generateRefreshToken();
    await db.refreshToken.create({
      data: {
        userId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs()),
      },
    });
    return refreshToken;
  }

  private async revokeAllActive(
    tx: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<void> {
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
