import { PrismaClient, Role } from '../src/generated/prisma/client';
import { PasswordHasher } from '../src/users/password-hasher';

// Dados de teste para desenvolvimento local, cobrindo as specs já implementadas.
// Nunca rodam com NODE_ENV=production (ver prisma/seed.ts).
// Ao concluir uma change, acrescente aqui os dados das novas specs.

export const DEV_PASSWORD = 'senhaSegura123';

// user-management / auth: um ou mais usuários de cada papel; clientes
// suficientes para exercitar a paginação de GET /users (ex.: limit=2).
const users: { name: string; email: string; role: Role }[] = [
  { name: 'Ana', email: 'ana@teste.com', role: Role.CUSTOMER },
  { name: 'Bruno', email: 'bruno@teste.com', role: Role.CUSTOMER },
  { name: 'Carlos', email: 'carlos@teste.com', role: Role.CUSTOMER },
  { name: 'Bia', email: 'bia@teste.com', role: Role.SUPPORT },
  { name: 'Carla', email: 'carla@teste.com', role: Role.SUPPORT },
  { name: 'Diego', email: 'diego@teste.com', role: Role.ADMIN },
];

// categories: ativas e uma inativa, para a listagem por papel.
const categories: { name: string; active: boolean }[] = [
  { name: 'Acesso', active: true },
  { name: 'Financeiro', active: true },
  { name: 'Suporte Técnico', active: true },
  { name: 'Legado', active: false },
];

/**
 * Cria ou restaura os dados de teste. Idempotente: registros já existentes
 * voltam ao estado descrito aqui (papel, senha, status da categoria), para
 * que as credenciais documentadas sempre funcionem.
 */
export async function seedDevData(
  prisma: PrismaClient,
  passwordHasher = new PasswordHasher(),
) {
  const passwordHash = await passwordHasher.hash(DEV_PASSWORD);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
  }

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: { active: category.active },
      create: category,
    });
  }

  return { users: users.length, categories: categories.length };
}
