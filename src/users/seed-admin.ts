import { PrismaClient, Role } from '../generated/prisma/client';
import { normalizeEmail } from './normalize-email';
import { PasswordHasher } from './password-hasher';

type AdminEnv = Partial<Record<'ADMIN_EMAIL' | 'ADMIN_PASSWORD', string>>;

function requireEnv(env: AdminEnv, name: keyof AdminEnv): string {
  const value = env[name];
  if (!value?.trim()) {
    throw new Error(`Variável de ambiente ${name} não definida`);
  }
  return value;
}

/**
 * Cria o ADMIN inicial se ainda não existir. Não altera um usuário já
 * cadastrado com o mesmo e-mail, então pode ser executado várias vezes.
 */
export async function seedAdmin(
  prisma: PrismaClient,
  env: AdminEnv,
  passwordHasher = new PasswordHasher(),
) {
  const email = normalizeEmail(requireEnv(env, 'ADMIN_EMAIL'));
  const password = requireEnv(env, 'ADMIN_PASSWORD');

  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Administrador',
      email,
      passwordHash: await passwordHasher.hash(password),
      role: Role.ADMIN,
    },
    select: { id: true, email: true, role: true },
  });
}
