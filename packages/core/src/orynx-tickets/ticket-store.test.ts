import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateOrynxTicketSchema } from '@devhub/contracts';
import { createOrynxTicketStore } from './ticket-store.ts';

let home: string;
let clock: number;
const now = () => clock;
const you = { kind: 'you' } as const;
const fields = (title: string) => CreateOrynxTicketSchema.parse({ title });

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'orynx-tickets-'));
  clock = Date.parse('2026-10-20T09:00:00.000Z');
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('the Orynx ticket store', () => {
  it('AC-7: numbers tickets from ORX-1, keeps them in tickets.json for the next start, readable by you alone', async () => {
    const path = join(home, 'devhub', 'tickets.json');
    const store = createOrynxTicketStore({ path, now });

    const first = await store.create(fields('Add bulk archive'), you);
    const second = await store.create({ ...fields('Fix the date test'), type: 'Bug', status: 'in_progress' }, you);

    expect(first).toEqual({
      key: 'ORX-1',
      title: 'Add bulk archive',
      description: '',
      type: 'Task',
      priority: 'Medium',
      status: 'to_do',
      dueDate: null,
      version: 1,
      createdBy: { kind: 'you' },
      createdAt: '2026-10-20T09:00:00.000Z',
      updatedAt: '2026-10-20T09:00:00.000Z',
      doneAt: null,
    });
    expect(second.key).toBe('ORX-2');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(home, 'devhub'))).mode & 0o777).toBe(0o700);

    const again = createOrynxTicketStore({ path, now });
    expect((await again.list()).map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-2']);
    expect(await again.get('ORX-2')).toEqual(second);
    expect(await again.get('ORX-9')).toBeNull();
  });

  it('AC-18: never uses a deleted ticket’s number again, even after a restart', async () => {
    const path = join(home, 'tickets.json');
    const store = createOrynxTicketStore({ path, now });
    await store.create(fields('One'), you);
    await store.create(fields('Two'), you);

    expect(await store.remove('ORX-2')).toBe(true);
    expect(await store.remove('ORX-2')).toBe(false);

    const again = createOrynxTicketStore({ path, now });
    expect((await again.create(fields('Three'), you)).key).toBe('ORX-3');
    expect((await again.list()).map((ticket) => ticket.key)).toEqual(['ORX-1', 'ORX-3']);
  });

  it('AC-14, AC-21: a change goes up a version, and Done remembers when the ticket got there', async () => {
    const store = createOrynxTicketStore({ path: join(home, 'tickets.json'), now });
    await store.create(fields('Add bulk archive'), you);

    clock += 60_000;
    const done = await store.update('ORX-1', { status: 'done', priority: 'High' });
    expect(done).toMatchObject({
      result: 'saved',
      ticket: { status: 'done', priority: 'High', version: 2, doneAt: '2026-10-20T09:01:00.000Z' },
    });

    clock += 60_000;
    const retitled = await store.update('ORX-1', { title: 'Archive in bulk' });
    expect(retitled).toMatchObject({ ticket: { version: 3, doneAt: '2026-10-20T09:01:00.000Z' } });

    const reopened = await store.update('ORX-1', { status: 'in_review' });
    expect(reopened).toMatchObject({
      ticket: { status: 'in_review', doneAt: null, updatedAt: '2026-10-20T09:02:00.000Z' },
    });
  });

  it('AC-16: a save made on an older version is refused with the ticket as it is now; one with no version lands', async () => {
    const store = createOrynxTicketStore({ path: join(home, 'tickets.json'), now });
    await store.create(fields('Add bulk archive'), you);
    await store.update('ORX-1', { status: 'in_progress' });

    const stale = await store.update('ORX-1', { priority: 'High', version: 1 });
    expect(stale).toMatchObject({
      result: 'changed',
      ticket: { status: 'in_progress', priority: 'Medium', version: 2 },
    });

    expect(await store.update('ORX-1', { priority: 'High', version: 2 })).toMatchObject({
      result: 'saved',
      ticket: { priority: 'High', version: 3 },
    });
    expect(await store.update('ORX-7', { priority: 'High' })).toEqual({ result: 'not_found' });
  });

  it('runs changes one at a time, so tickets made together each get their own number and all are kept', async () => {
    const path = join(home, 'tickets.json');
    const store = createOrynxTicketStore({ path, now });

    const made = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((title) => store.create(fields(title), you)));

    expect(made.map((ticket) => ticket.key).sort()).toEqual(['ORX-1', 'ORX-2', 'ORX-3', 'ORX-4', 'ORX-5']);
    expect(await createOrynxTicketStore({ path, now }).list()).toHaveLength(5);
  });

  it('AC-11: a save that fails changes nothing, here or on disk', async () => {
    // A file where the folder should be: the folder can't be made, so nothing can be written.
    await writeFile(join(home, 'blocked'), 'a file');
    const store = createOrynxTicketStore({ path: join(home, 'blocked', 'tickets.json'), now });

    await expect(store.create(fields('Add bulk archive'), you)).rejects.toThrow();

    expect(await store.list()).toEqual([]);
  });

  it('AC-34: moves a file it can’t read aside, never saves over it, and names it', async () => {
    const path = join(home, 'tickets.json');
    await writeFile(path, '{ "tickets": [ { "key": "nope" ', { mode: 0o600 });
    const store = createOrynxTicketStore({ path, now });

    expect(await store.list()).toEqual([]);
    const kept = store.kept();
    expect(kept).toBe('tickets-20261020-090000.unreadable.json');

    await store.create(fields('Add bulk archive'), you);
    expect(await readFile(join(home, kept ?? ''), 'utf8')).toBe('{ "tickets": [ { "key": "nope" ');
    expect((await stat(join(home, kept ?? ''))).mode & 0o777).toBe(0o600);
    expect((await readdir(home)).sort()).toEqual([kept, 'tickets.json']);
  });

  it('keeps nothing aside when there is no file yet', async () => {
    const store = createOrynxTicketStore({ path: join(home, 'tickets.json'), now });
    expect(await store.list()).toEqual([]);
    expect(store.kept()).toBeNull();
  });

  it('keeps tickets for this run only when it has no file', async () => {
    const store = createOrynxTicketStore({ now });
    await store.create(fields('Add bulk archive'), { kind: 'agent', name: 'Cursor' });
    expect(await store.get('ORX-1')).toMatchObject({ createdBy: { kind: 'agent', name: 'Cursor' } });
    expect(await readdir(home)).toEqual([]);
  });
});
