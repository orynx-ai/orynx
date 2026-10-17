import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  defaultPreferences,
  PreferencesSchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createFileSettingsStore, settingsFilePath } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

const servers: FastifyInstance[] = [];
const folders: string[] = [];

async function server(options: Partial<CoreOptions> = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const app = await createServer({ token, port, version: '1.2.3', events, ...options });
  servers.push(app);
  return { app, seen };
}

async function home(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'devhub-preferences-'));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('/api/preferences', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    for (const method of ['GET', 'PATCH'] as const) {
      const res = await app.inject({ method, url: apiRoutes.preferences, headers: { host: headers.host } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('AC-2, AC-12: GET answers with the defaults on a fresh DevHub', async () => {
    const { app } = await server();

    const res = await app.inject({ method: 'GET', url: apiRoutes.preferences, headers });

    expect(res.statusCode).toBe(200);
    expect(PreferencesSchema.parse(res.json())).toEqual(defaultPreferences);
  });

  it('AC-3, AC-17: PATCH saves the mode to settings.json, answers with every preference and says settings changed', async () => {
    const folder = await home();
    const { app, seen } = await server({ settings: createFileSettingsStore(folder) });

    const res = await app.inject({
      method: 'PATCH',
      url: apiRoutes.preferences,
      headers,
      payload: { permissionMode: 'ask_everything' },
    });

    expect(res.statusCode).toBe(200);
    expect(PreferencesSchema.parse(res.json())).toEqual({ ...defaultPreferences, permissionMode: 'ask_everything' });
    expect(JSON.parse(await readFile(settingsFilePath(folder), 'utf8'))).toEqual({
      agent: { permissionMode: 'ask_everything' },
    });
    expect(seen).toContainEqual({ type: 'settings.changed' });
  });

  it('AC-3, AC-13: a restarted DevHub answers with what was saved', async () => {
    const folder = await home();
    const first = await server({ settings: createFileSettingsStore(folder) });
    await first.app.inject({
      method: 'PATCH',
      url: apiRoutes.preferences,
      headers,
      payload: { permissionMode: 'edit_and_run_allowed', inboxRules: { unresolved_comments: false } },
    });
    await first.app.close();

    const { app } = await server({ settings: createFileSettingsStore(folder) });
    const res = await app.inject({ method: 'GET', url: apiRoutes.preferences, headers });

    expect(PreferencesSchema.parse(res.json())).toEqual({
      permissionMode: 'edit_and_run_allowed',
      inboxRules: { ...defaultPreferences.inboxRules, unresolved_comments: false },
    });
  });

  it('PATCH refuses an empty change or an unknown mode with bad_request, and saves nothing', async () => {
    const { app, seen } = await server();

    for (const payload of [{}, { permissionMode: 'yolo' }]) {
      const res = await app.inject({ method: 'PATCH', url: apiRoutes.preferences, headers, payload });
      expect(res.statusCode).toBe(400);
      expect(ApiErrorSchema.parse(res.json()).code).toBe('bad_request');
    }
    expect(seen).toEqual([]);
  });
});
