import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  OrynxTicketAnswerSchema,
  OrynxTicketDeleteAnswerSchema,
  OrynxTicketSaveAnswerSchema,
  OrynxTicketSchema,
  tokenHeader,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createOrynxTicketStore } from '../orynx-tickets/ticket-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const ticketRoute = (key: string) => apiRoutes.orynxTicket.replace(':key', key);

const servers: FastifyInstance[] = [];
const folders: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({ token, port, version: '1.2.3', ...options });
  servers.push(app);
  return app;
}

function create(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: apiRoutes.orynxTickets, headers, payload });
}

describe('Orynx tickets over /api', () => {
  it('AC-7, AC-13: makes ORX-1 from a title alone, then reads it back', async () => {
    const app = await server();

    const made = await create(app, { title: 'Add bulk archive', status: 'in_progress', dueDate: '2026-10-24' });

    expect(made.statusCode).toBe(200);
    expect(OrynxTicketSchema.parse(made.json())).toMatchObject({
      key: 'ORX-1',
      type: 'Task',
      priority: 'Medium',
      status: 'in_progress',
      dueDate: '2026-10-24',
      createdBy: { kind: 'you' },
      session: null,
    });
    const read = await app.inject({ method: 'GET', url: ticketRoute('ORX-1'), headers });
    expect(OrynxTicketAnswerSchema.parse(read.json())).toMatchObject({ result: 'found', ticket: { key: 'ORX-1' } });
    const none = await app.inject({ method: 'GET', url: ticketRoute('ORX-2'), headers });
    expect(none.json()).toEqual({ result: 'not_found' });
  });

  it('AC-14, AC-16: saves a change, and refuses one made on an older version', async () => {
    const app = await server();
    await create(app, { title: 'Add bulk archive' });

    const moved = await app.inject({
      method: 'PATCH',
      url: ticketRoute('ORX-1'),
      headers,
      payload: { status: 'in_review' },
    });
    expect(OrynxTicketSaveAnswerSchema.parse(moved.json())).toMatchObject({ result: 'saved', ticket: { version: 2 } });

    const stale = await app.inject({
      method: 'PATCH',
      url: ticketRoute('ORX-1'),
      headers,
      payload: { priority: 'High', version: 1 },
    });
    expect(OrynxTicketSaveAnswerSchema.parse(stale.json())).toMatchObject({
      result: 'changed',
      ticket: { status: 'in_review', priority: 'Medium' },
    });
  });

  it('AC-18: deletes a ticket, and says when there is none', async () => {
    const app = await server();
    await create(app, { title: 'Add bulk archive' });

    const gone = await app.inject({ method: 'DELETE', url: ticketRoute('ORX-1'), headers });
    expect(OrynxTicketDeleteAnswerSchema.parse(gone.json())).toEqual({ result: 'deleted' });
    const again = await app.inject({ method: 'DELETE', url: ticketRoute('ORX-1'), headers });
    expect(again.json()).toEqual({ result: 'not_found' });
    expect((await create(app, { title: 'Next' })).json()).toMatchObject({ key: 'ORX-2' });
  });

  it('AC-35: refuses a body with no title or an unknown status, and a key that isn’t Orynx’s, changing nothing', async () => {
    const app = await server();

    for (const payload of [{}, { title: '   ' }, { title: 'x', status: 'blocked' }, { title: 'x', priority: 'P1' }]) {
      const refused = await create(app, payload);
      expect(refused.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(refused.json()).code).toBe('bad_request');
    }
    for (const key of ['PROJ-1', 'ORX-x']) {
      expect((await app.inject({ method: 'GET', url: ticketRoute(key), headers })).statusCode).toBe(400);
    }
    expect((await create(app, { title: 'First' })).json()).toMatchObject({ key: 'ORX-1' });
  });

  it('AC-35: refuses a request without the session token', async () => {
    const app = await server();
    const refused = await app.inject({
      method: 'POST',
      url: apiRoutes.orynxTickets,
      headers: { host: headers.host },
      payload: { title: 'Add bulk archive' },
    });
    expect(refused.statusCode).toBe(401);
  });

  it('AC-11: a ticket that can’t be saved is a 500, and nothing is made', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'orynx-route-'));
    folders.push(folder);
    await writeFile(join(folder, 'blocked'), 'a file where the folder should be');
    const app = await server({
      orynxTickets: createOrynxTicketStore({ path: join(folder, 'blocked', 'tickets.json') }),
    });

    const failed = await create(app, { title: 'Add bulk archive' });

    expect(failed.statusCode).toBe(500);
    expect((await app.inject({ method: 'GET', url: ticketRoute('ORX-1'), headers })).json()).toEqual({
      result: 'not_found',
    });
  });

  it('AC-33: Clear cache leaves Orynx tickets alone', async () => {
    const app = await server();
    await create(app, { title: 'Add bulk archive' });

    const cleared = await app.inject({ method: 'DELETE', url: apiRoutes.inboxCache, headers });

    expect(cleared.statusCode).toBeLessThan(300);
    expect((await app.inject({ method: 'GET', url: ticketRoute('ORX-1'), headers })).json()).toMatchObject({
      result: 'found',
    });
  });
});
