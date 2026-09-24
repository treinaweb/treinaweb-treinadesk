import { Role, TicketStatus } from '../generated/prisma/client';
import { canTransition, TransitionInput } from './ticket-transitions';

type Actor =
  | 'cliente dono'
  | 'cliente não dono'
  | 'atendente atribuído'
  | 'atendente não atribuído'
  | 'ADMIN';

const actors: Record<
  Actor,
  Pick<TransitionInput, 'role' | 'isOwner' | 'isAssignee'>
> = {
  'cliente dono': { role: Role.CUSTOMER, isOwner: true, isAssignee: false },
  'cliente não dono': {
    role: Role.CUSTOMER,
    isOwner: false,
    isAssignee: false,
  },
  'atendente atribuído': {
    role: Role.SUPPORT,
    isOwner: false,
    isAssignee: true,
  },
  'atendente não atribuído': {
    role: Role.SUPPORT,
    isOwner: false,
    isAssignee: false,
  },
  ADMIN: { role: Role.ADMIN, isOwner: false, isAssignee: false },
};

// Tabela da spec: somente estas combinações são permitidas.
const allowed: [TicketStatus, TicketStatus, Actor[]][] = [
  ['IN_PROGRESS', 'WAITING_CUSTOMER', ['atendente atribuído', 'ADMIN']],
  ['IN_PROGRESS', 'RESOLVED', ['atendente atribuído', 'ADMIN']],
  ['WAITING_CUSTOMER', 'RESOLVED', ['atendente atribuído', 'ADMIN']],
  ['RESOLVED', 'IN_PROGRESS', ['cliente dono']],
  ['RESOLVED', 'CLOSED', ['cliente dono', 'ADMIN']],
  ['OPEN', 'CLOSED', ['cliente dono', 'ADMIN']],
];

const statuses = Object.values(TicketStatus);

function isAllowed(from: TicketStatus, to: TicketStatus, actor: Actor) {
  return allowed.some(
    ([f, t, who]) => f === from && t === to && who.includes(actor),
  );
}

describe('canTransition', () => {
  const combinations = statuses.flatMap((from) =>
    statuses.flatMap((to) =>
      (Object.keys(actors) as Actor[]).map(
        (actor) => [from, to, actor, isAllowed(from, to, actor)] as const,
      ),
    ),
  );

  it('cobre todas as 125 combinações de status e ator', () => {
    expect(combinations).toHaveLength(125);
  });

  it.each(combinations)('%s → %s por %s: %s', (from, to, actor, expected) => {
    expect(canTransition({ from, to, ...actors[actor] })).toBe(expected);
  });

  it('OPEN → IN_PROGRESS é negado para todos (só pela atribuição)', () => {
    for (const actor of Object.values(actors)) {
      expect(canTransition({ from: 'OPEN', to: 'IN_PROGRESS', ...actor })).toBe(
        false,
      );
    }
  });

  it('status igual ao atual é negado para todos', () => {
    for (const status of statuses) {
      for (const actor of Object.values(actors)) {
        expect(canTransition({ from: status, to: status, ...actor })).toBe(
          false,
        );
      }
    }
  });

  it('nenhuma saída de CLOSED é permitida', () => {
    for (const to of statuses) {
      for (const actor of Object.values(actors)) {
        expect(canTransition({ from: 'CLOSED', to, ...actor })).toBe(false);
      }
    }
  });

  it('ADMIN não reabre ticket resolvido', () => {
    expect(
      canTransition({ from: 'RESOLVED', to: 'IN_PROGRESS', ...actors.ADMIN }),
    ).toBe(false);
  });

  it('isOwner não dá poderes de dono a SUPPORT nem a ADMIN', () => {
    for (const role of [Role.SUPPORT, Role.ADMIN]) {
      expect(
        canTransition({
          from: 'RESOLVED',
          to: 'IN_PROGRESS',
          role,
          isOwner: true,
          isAssignee: false,
        }),
      ).toBe(false);
    }
  });

  it('isAssignee não dá poderes de atendente a CUSTOMER', () => {
    expect(
      canTransition({
        from: 'IN_PROGRESS',
        to: 'RESOLVED',
        role: Role.CUSTOMER,
        isOwner: true,
        isAssignee: true,
      }),
    ).toBe(false);
  });
});
