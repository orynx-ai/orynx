import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import {
  StoredOrynxTicketSchema,
  type OrynxTicketCreator,
  type OrynxTicketFields,
  type StoredOrynxTicket,
  type UpdateOrynxTicket,
} from '@devhub/contracts';
import { oneAtATime } from '../settings/settings-store.ts';

/**
 * Orynx's own tickets (spec 037) in `<DEVHUB_HOME>/tickets.json`, beside `settings.json` and never in `cache.db`,
 * which Clear cache wipes (AC-33). The hub is the file's only writer, so the tickets are read once and kept in
 * memory; each change writes the whole file the way settings.json is written.
 *
 * shortcut: the whole file is written on every change, fine for the few hundred tickets one person keeps; move to
 * a SQLite table if anyone keeps thousands.
 */

const TicketsFileSchema = z.object({
  /** The next ticket's number. It never goes down, so a deleted ticket's key is never used again (Q4). */
  next: z.int().positive(),
  tickets: z.array(StoredOrynxTicketSchema),
});
type TicketsFile = z.infer<typeof TicketsFileSchema>;

export type OrynxTicketUpdate = { result: 'saved' | 'changed'; ticket: StoredOrynxTicket } | { result: 'not_found' };

export interface OrynxTicketStore {
  /** Every ticket, oldest first. */
  list(): Promise<StoredOrynxTicket[]>;
  get(key: string): Promise<StoredOrynxTicket | null>;
  create(fields: OrynxTicketFields, createdBy: OrynxTicketCreator): Promise<StoredOrynxTicket>;
  /** With `version`, refused as `changed` when the ticket has moved on since (AC-16). */
  update(key: string, change: UpdateOrynxTicket): Promise<OrynxTicketUpdate>;
  /** False when there was no such ticket. */
  remove(key: string): Promise<boolean>;
  /** The name of the unreadable file moved aside at the first read (AC-34), or null. */
  kept(): string | null;
}

export interface OrynxTicketStoreOptions {
  /** `<DEVHUB_HOME>/tickets.json`. Left out, the tickets last for this run only: tests, and a host with no folder. */
  path?: string;
  /** The clock, in milliseconds. */
  now?: () => number;
}

/** `tickets-20261020-090000.unreadable.json`, from the time it was moved, in UTC. */
function keptName(at: number): string {
  const stamp = new Date(at).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `tickets-${stamp}.unreadable.json`;
}

function missing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

export function createOrynxTicketStore({ path, now = Date.now }: OrynxTicketStoreOptions = {}): OrynxTicketStore {
  const queue = oneAtATime();
  let loaded: Promise<TicketsFile> | null = null;
  let keptAside: string | null = null;

  async function load(): Promise<TicketsFile> {
    const empty: TicketsFile = { next: 1, tickets: [] };
    if (path === undefined) return empty;
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if (missing(error)) return empty;
      throw error;
    }
    let parsed: TicketsFile;
    try {
      parsed = TicketsFileSchema.parse(JSON.parse(text));
    } catch {
      // A newer Orynx, or a hand edit, wrote what this one can't read: keep it rather than ever save over it.
      const name = keptName(now());
      const kept = join(dirname(path), name);
      await rename(path, kept);
      await chmod(kept, 0o600);
      keptAside = name;
      return empty;
    }
    return parsed;
  }

  function read(): Promise<TicketsFile> {
    // A read that failed (not a missing file) is tried again next time.
    loaded ??= load().catch((error: unknown) => {
      loaded = null;
      throw error;
    });
    return loaded;
  }

  async function write(file: TicketsFile): Promise<void> {
    if (path === undefined) return;
    const folder = dirname(path);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const temporary = join(folder, `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
    try {
      await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** Works out the next file from the current one and saves it; memory moves on only once the file has. */
  function change<T>(work: (file: TicketsFile) => { file: TicketsFile; answer: T } | { answer: T }): Promise<T> {
    return queue(async () => {
      const current = await read();
      const done = work(current);
      if ('file' in done) {
        await write(done.file);
        loaded = Promise.resolve(done.file);
      }
      return done.answer;
    });
  }

  return {
    async list() {
      return [...(await read()).tickets];
    },

    async get(key) {
      return (await read()).tickets.find((ticket) => ticket.key === key) ?? null;
    },

    create(fields, createdBy) {
      return change((file) => {
        const at = new Date(now()).toISOString();
        const ticket: StoredOrynxTicket = {
          key: `ORX-${String(file.next)}`,
          ...fields,
          version: 1,
          createdBy,
          createdAt: at,
          updatedAt: at,
          doneAt: fields.status === 'done' ? at : null,
        };
        return { file: { next: file.next + 1, tickets: [...file.tickets, ticket] }, answer: ticket };
      });
    },

    update(key, { version, ...fields }) {
      return change<OrynxTicketUpdate>((file) => {
        const current = file.tickets.find((ticket) => ticket.key === key);
        if (current === undefined) return { answer: { result: 'not_found' } };
        if (version !== undefined && version !== current.version) {
          return { answer: { result: 'changed', ticket: current } };
        }
        const at = new Date(now()).toISOString();
        const status = fields.status ?? current.status;
        const doneAt = status !== 'done' ? null : current.status === 'done' ? current.doneAt : at;
        // A field given as undefined changes nothing, as a field left out doesn't.
        const given = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
        const ticket: StoredOrynxTicket = {
          ...current,
          ...given,
          version: current.version + 1,
          updatedAt: at,
          doneAt,
        };
        const tickets = file.tickets.map((held) => (held.key === key ? ticket : held));
        return { file: { ...file, tickets }, answer: { result: 'saved', ticket } };
      });
    },

    remove(key) {
      return change((file) => {
        const tickets = file.tickets.filter((ticket) => ticket.key !== key);
        if (tickets.length === file.tickets.length) return { answer: false };
        return { file: { ...file, tickets }, answer: true };
      });
    },

    kept: () => keptAside,
  };
}
