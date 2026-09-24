import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { seedAdmin } from '../src/users/seed-admin';
import { DEV_PASSWORD, seedDevData } from './dev-data';

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const admin = await seedAdmin(prisma, process.env);
    console.log(`Administrador disponível: ${admin.email} (${admin.role})`);

    if (process.env.NODE_ENV === 'production') {
      console.log('NODE_ENV=production: dados de teste ignorados');
      return;
    }
    const dev = await seedDevData(prisma);
    console.log(
      `Dados de teste: ${dev.users} usuários (senha ${DEV_PASSWORD}), ${dev.categories} categorias, ${dev.tickets} tickets e ${dev.comments} comentários`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
