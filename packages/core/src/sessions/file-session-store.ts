import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionIdSchema } from '@devhub/contracts';
import { endProgress } from './progress.ts';
import { listedSession, StoredSessionSchema, type SessionRecords, type StoredSession } from './session-store.ts';

/**
 * Sessions on disk (spec 011): `<DEVHUB_HOME>/sessions/<id>/session.json` and `brief.md`, readable by you
 * only. Every write goes to a temporary file that is then renamed into place, so a crash never leaves a
 * half-written session, and one session's writes run one after another. The sessions are also held in
 * memory, so a list never reads the disk.
 */

export function sessionsFolder(home: string): string {
  return join(home, 'sessions');
}

export interface FileSessionStoreOptions {
  now?: () => number;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

/**
 * Reads every session. One that was Working or waiting when Orynx stopped is Stopped now, with the step
 * "Orynx closed while Claude was working" (AC-14): its Claude Code ended with the server, and so did any
 * call waiting for your answer (spec 012).
 */
export async function openFileSessionStore(
  home: string,
  { now = Date.now }: FileSessionStoreOptions = {},
): Promise<SessionRecords> {
  const root = sessionsFolder(home);
  const records = new Map<string, StoredSession>();
  const queues = new Map<string, Promise<unknown>>();

  let names: string[] = [];
  try {
    names = await readdir(root);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
  for (const name of names) {
    if (!SessionIdSchema.safeParse(name).success) continue;
    try {
      const saved = StoredSessionSchema.safeParse(JSON.parse(await readFile(join(root, name, 'session.json'), 'utf8')));
      if (saved.success && saved.data.session.id === name) records.set(name, saved.data);
    } catch {
      // A session Orynx can't read stays on disk and out of the list.
    }
  }

  async function folderFor(id: string): Promise<string> {
    const folder = join(root, id);
    await mkdir(folder, { recursive: true, mode: 0o700 });
    await chmod(root, 0o700);
    await chmod(folder, 0o700);
    return folder;
  }

  async function writeAtomically(folder: string, file: string, text: string): Promise<void> {
    const temporary = join(folder, `.${file}.${randomBytes(6).toString('hex')}`);
    await writeFile(temporary, text, { mode: 0o600 });
    await rename(temporary, join(folder, file));
  }

  async function save(record: StoredSession): Promise<void> {
    await writeAtomically(await folderFor(record.session.id), 'session.json', `${JSON.stringify(record, null, 2)}\n`);
  }

  /** Runs `work` after every earlier write for this session. */
  function inTurn<T>(id: string, work: () => Promise<T>): Promise<T> {
    const turn = (queues.get(id) ?? Promise.resolve()).then(work);
    queues.set(
      id,
      turn.catch(() => undefined),
    );
    return turn;
  }

  for (const [id, record] of records) {
    const { session } = record;
    if (session.state !== 'working' && session.state !== 'needs_you') continue;
    const at = new Date(now()).toISOString();
    const progress = endProgress({ step: session.step, activities: session.activities }, { kind: 'interrupted' });
    const stopped: StoredSession = {
      ...record,
      session: {
        ...session,
        state: 'stopped',
        activities: [...progress.activities],
        // A call that was waiting for you went with Claude Code; it stays in the log, unanswered (spec 012, AC-21).
        approvals: [],
        endedAt: session.endedAt ?? at,
        updatedAt: at,
      },
      approvalLog: record.approvalLog.map((entry) =>
        entry.by === null ? { ...entry, by: 'closed', answeredAt: at } : entry,
      ),
    };
    records.set(id, stopped);
    await save(stopped);
  }

  const known = (id: string) => SessionIdSchema.safeParse(id).success && records.has(id);

  return {
    list: () => Promise.resolve([...records.values()].map((record) => listedSession(record.session))),
    get: (id) => Promise.resolve(known(id) ? (records.get(id) ?? null) : null),
    create: (record) =>
      inTurn(record.session.id, async () => {
        records.set(record.session.id, record);
        await save(record);
      }),
    update: (id, change) =>
      inTurn(id, async () => {
        const current = known(id) ? records.get(id) : undefined;
        if (current === undefined) return null;
        const next = change(current);
        records.set(id, next);
        await save(next);
        return next;
      }),
    writeBrief: (id, text) =>
      inTurn(id, async () => {
        await writeAtomically(await folderFor(id), 'brief.md', text);
      }),
  };
}
