import type {
  OrynxTicket,
  OrynxTicketCreator,
  OrynxTicketDeleteAnswer,
  OrynxTicketFields,
  OrynxTicketSaveAnswer,
  StoredOrynxTicket,
  UpdateOrynxTicket,
} from '@devhub/contracts';
import type { EventBus } from '../events/event-bus.ts';
import type { SessionStore } from '../sessions/session-store.ts';
import { sessionsByTicket } from '../sessions/ticket-sessions.ts';
import type { OrynxTicketStore } from './ticket-store.ts';

/**
 * What every door onto Orynx's own tickets calls (spec 037): the routes the page uses, the tools a session's agent
 * gets, and the MCP server for agents outside Orynx. Each ticket comes with its newest session, as Tickets shows
 * Jira's, and every change says `tickets.changed`, so every open page shows it at once (AC-32).
 */
export interface OrynxTicketService {
  /** Every ticket, oldest first. */
  list(): Promise<OrynxTicket[]>;
  get(key: string): Promise<OrynxTicket | null>;
  create(fields: OrynxTicketFields, createdBy: OrynxTicketCreator): Promise<OrynxTicket>;
  update(key: string, change: UpdateOrynxTicket): Promise<OrynxTicketSaveAnswer>;
  remove(key: string): Promise<OrynxTicketDeleteAnswer>;
  /** The unreadable file moved aside at the first read (AC-34), or null. */
  kept(): string | null;
}

export interface OrynxTicketServiceOptions {
  store: OrynxTicketStore;
  sessions: Pick<SessionStore, 'list'>;
  events: EventBus;
}

export function createOrynxTicketService({ store, sessions, events }: OrynxTicketServiceOptions): OrynxTicketService {
  async function withSessions(tickets: readonly StoredOrynxTicket[]): Promise<OrynxTicket[]> {
    const joined = sessionsByTicket(await sessions.list());
    return tickets.map((ticket) => ({ ...ticket, session: joined.get(ticket.key) ?? null }));
  }

  async function one(ticket: StoredOrynxTicket): Promise<OrynxTicket> {
    const [joined] = await withSessions([ticket]);
    return joined ?? { ...ticket, session: null };
  }

  function changed() {
    events.publish({ type: 'tickets.changed' });
  }

  return {
    async list() {
      return withSessions(await store.list());
    },

    async get(key) {
      const ticket = await store.get(key);
      return ticket === null ? null : one(ticket);
    },

    async create(fields, createdBy) {
      const ticket = await store.create(fields, createdBy);
      changed();
      return one(ticket);
    },

    async update(key, change) {
      const saved = await store.update(key, change);
      if (saved.result === 'not_found') return saved;
      if (saved.result === 'saved') changed();
      return { result: saved.result, ticket: await one(saved.ticket) };
    },

    async remove(key) {
      if (!(await store.remove(key))) return { result: 'not_found' };
      changed();
      return { result: 'deleted' };
    },

    kept: () => store.kept(),
  };
}
