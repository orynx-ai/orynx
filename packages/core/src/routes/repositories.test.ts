import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  RepositoryListSchema,
  RepositorySchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createFileSettingsStore, settingsFilePath } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let root: string;
let home: string;
let dataDir: string;
const servers: FastifyInstance[] = [];

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-repository-routes-')));
  home = join(root, 'home');
  dataDir = join(home, '.devhub');
  await mkdir(join(home, 'code', 'app', '.git'), { recursive: true });
  await mkdir(join(home, 'plain'));
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await rm(dataDir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function server() {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    events,
    settings: createFileSettingsStore(dataDir),
    userHome: home,
    dataDir,
  });
  servers.push(app);
  return { app, seen };
}

function folderUrl(id: string): string {
  return apiRoutes.repository.replace(':id', id);
}

describe('/api/repositories', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    for (const [method, url] of [
      ['GET', apiRoutes.repositories],
      ['POST', apiRoutes.repositories],
      ['DELETE', folderUrl('0123456789abcdef')],
    ] as const) {
      const res = await app.inject({ method, url, headers: { host: headers.host } });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('AC-4: GET lists nothing on a fresh DevHub', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'GET', url: apiRoutes.repositories, headers });

    expect(RepositoryListSchema.parse(res.json())).toEqual({ repositories: [] });
  });

  it('AC-6, AC-17: POST adds the folder, answers 201 with it, saves settings.json and says settings changed', async () => {
    const { app, seen } = await server();

    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.repositories,
      headers,
      payload: { path: '~/code/app', jiraProject: 'PROJ' },
    });

    expect(res.statusCode).toBe(201);
    const added = RepositorySchema.parse(res.json());
    expect(added).toMatchObject({ path: join(home, 'code', 'app'), displayPath: '~/code/app', jiraProject: 'PROJ' });
    expect(JSON.parse(await readFile(settingsFilePath(dataDir), 'utf8'))).toEqual({
      repositories: [{ id: added.id, path: join(home, 'code', 'app'), jiraProject: 'PROJ' }],
    });
    expect(seen).toContainEqual({ type: 'settings.changed' });
  });

  it('AC-7: POST answers 422 folder_rejected with the message for the Folder field', async () => {
    const { app } = await server();

    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.repositories,
      headers,
      payload: { path: '~/plain', jiraProject: null },
    });

    expect(res.statusCode).toBe(422);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'folder_rejected',
      message: "This folder isn't a git repository. Claude works on a branch, so it needs one.",
    });
  });

  it('POST refuses a body the form would never send with bad_request', async () => {
    const { app } = await server();

    for (const payload of [
      { path: '', jiraProject: null },
      { path: '~/code/app' },
      { path: '~/code/app', jiraProject: 'p' },
    ]) {
      const res = await app.inject({ method: 'POST', url: apiRoutes.repositories, headers, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
    }
  });

  it('AC-11: DELETE removes the folder and answers 204; a restarted DevHub lists what is left', async () => {
    const first = await server();
    const added = RepositorySchema.parse(
      (
        await first.app.inject({
          method: 'POST',
          url: apiRoutes.repositories,
          headers,
          payload: { path: '~/code/app', jiraProject: null },
        })
      ).json(),
    );

    const res = await first.app.inject({ method: 'DELETE', url: folderUrl(added.id), headers });
    expect(res.statusCode).toBe(204);
    await first.app.close();

    const { app } = await server();
    const list = await app.inject({ method: 'GET', url: apiRoutes.repositories, headers });
    expect(RepositoryListSchema.parse(list.json())).toEqual({ repositories: [] });
  });

  it('DELETE refuses an id DevHub never makes with bad_request', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'DELETE', url: folderUrl('..%2F..%2Fetc'), headers });

    expect(res.statusCode).toBe(400);
  });
});
