import {
  PrismaClient,
  Role,
  TicketPriority,
  TicketStatus,
} from '../src/generated/prisma/client.js';
import { PasswordHasher } from '../src/users/password-hasher.js';

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

// tickets: um em cada status, de Ana e Bruno (clientes A e B), com Bia e
// Carla (atendentes S1 e S2). Ids fixos para o upsert ser idempotente.
const tickets: {
  id: string;
  title: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  customer: string;
  assignee: string | null;
}[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    title: 'Cobrança duplicada',
    description: 'Fui cobrada duas vezes na fatura de março.',
    priority: TicketPriority.HIGH,
    status: TicketStatus.OPEN,
    category: 'Financeiro',
    customer: 'ana@teste.com',
    assignee: null,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    title: 'Nota fiscal errada',
    description: 'A nota fiscal de abril saiu com o CNPJ errado.',
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.OPEN,
    category: 'Financeiro',
    customer: 'bruno@teste.com',
    assignee: null,
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    title: 'Senha expirada',
    description: 'Não consigo entrar no sistema depois que a senha expirou.',
    priority: TicketPriority.URGENT,
    status: TicketStatus.IN_PROGRESS,
    category: 'Acesso',
    customer: 'ana@teste.com',
    assignee: 'bia@teste.com',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000004',
    title: 'Relatório não carrega',
    description: 'O relatório mensal fica carregando e não abre.',
    priority: TicketPriority.MEDIUM,
    status: TicketStatus.WAITING_CUSTOMER,
    category: 'Suporte Técnico',
    customer: 'bruno@teste.com',
    assignee: 'carla@teste.com',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000005',
    title: 'Erro ao exportar planilha',
    description: 'A exportação para planilha gera um arquivo vazio.',
    priority: TicketPriority.LOW,
    status: TicketStatus.RESOLVED,
    category: 'Suporte Técnico',
    customer: 'ana@teste.com',
    assignee: 'bia@teste.com',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000006',
    title: 'Boleto vencido',
    description: 'Preciso de um novo boleto, o anterior venceu.',
    priority: TicketPriority.LOW,
    status: TicketStatus.CLOSED,
    category: 'Financeiro',
    customer: 'bruno@teste.com',
    assignee: 'carla@teste.com',
  },
];

// comments: a conversa de "Senha expirada" (Ana e Bia, com uma nota interna
// que Ana não pode ver) e um comentário no ticket fechado de Bruno.
// "Relatório não carrega" fica sem comentário de Bruno para exercitar a
// retomada de WAITING_CUSTOMER. createdAt fixo mantém a ordem da listagem.
const comments: {
  id: string;
  ticketId: string;
  author: string;
  body: string;
  isInternal: boolean;
  createdAt: Date;
}[] = [
  {
    id: 'e0000000-0000-4000-8000-000000000001',
    ticketId: 'd0000000-0000-4000-8000-000000000003',
    author: 'ana@teste.com',
    body: 'Segue o comprovante',
    isInternal: false,
    createdAt: new Date('2026-09-20T10:00:00Z'),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000002',
    ticketId: 'd0000000-0000-4000-8000-000000000003',
    author: 'bia@teste.com',
    body: 'Estamos verificando',
    isInternal: false,
    createdAt: new Date('2026-09-20T10:05:00Z'),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000003',
    ticketId: 'd0000000-0000-4000-8000-000000000003',
    author: 'bia@teste.com',
    body: 'Cliente já pediu estorno antes',
    isInternal: true,
    createdAt: new Date('2026-09-20T10:10:00Z'),
  },
  {
    id: 'e0000000-0000-4000-8000-000000000004',
    ticketId: 'd0000000-0000-4000-8000-000000000006',
    author: 'bruno@teste.com',
    body: 'Obrigado, o novo boleto chegou',
    isInternal: false,
    createdAt: new Date('2026-09-20T11:00:00Z'),
  },
];

/**
 * Cria ou restaura os dados de teste. Idempotente: registros já existentes
 * voltam ao estado descrito aqui (papel, senha, status da categoria, status e
 * atendente do ticket, texto e visibilidade dos comentários), para que as
 * credenciais documentadas sempre funcionem.
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

  const userIds = new Map(
    (await prisma.user.findMany({ select: { id: true, email: true } })).map(
      (u) => [u.email, u.id],
    ),
  );
  const categoryIds = new Map(
    (await prisma.category.findMany({ select: { id: true, name: true } })).map(
      (c) => [c.name, c.id],
    ),
  );

  for (const { id, category, customer, assignee, ...ticket } of tickets) {
    const data = {
      ...ticket,
      categoryId: categoryIds.get(category)!,
      customerId: userIds.get(customer)!,
      assigneeId: assignee && userIds.get(assignee)!,
      closedAt: ticket.status === TicketStatus.CLOSED ? new Date() : null,
    };
    await prisma.ticket.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  for (const { id, author, ...comment } of comments) {
    const data = { ...comment, authorId: userIds.get(author)! };
    await prisma.comment.upsert({
      where: { id },
      update: data,
      create: { id, ...data },
    });
  }

  return {
    users: users.length,
    categories: categories.length,
    tickets: tickets.length,
    comments: comments.length,
  };
}
