import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  defaultProfile,
  ProfileSchema,
  SetupStateSchema,
  tokenHeader,
} from '@devhub/contracts';
import { makeProfile } from '@devhub/contracts/testing';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createFileSettingsStore, settingsFilePath } from '../settings/settings-store.ts';
import { createPasswordStore, passwordFilePath } from '../setup/password-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const ada = makeProfile({ name: 'Ada Lovelace', bio: 'Builds things', picture: 'data:image/webp;base64,UklGRg==' });

const servers: FastifyInstance[] = [];
const folders: string[] = [];

async function server(options: Partial<CoreOptions> = {}) {
  const app = await createServer({ token, port, version: '1.2.3', ...options });
  servers.push(app);
  return app;
}

async function home(): Promise<string> {
  const folder = await mkdtemp(join(tmpdir(), 'devhub-setup-'));
  folders.push(folder);
  return folder;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe('/api/setup (spec 043)', () => {
  it('answers 401 without the session token', async () => {
    const app = await server();
    for (const [method, url] of [
      ['GET', apiRoutes.setup],
      ['POST', apiRoutes.setup],
      ['GET', apiRoutes.profile],
      ['PUT', apiRoutes.profile],
    ] as const) {
      const res = await app.inject({ method, url, headers: { host: headers.host } });
      expect(res.statusCode).toBe(401);
    }
  });

  it('AC-1: says a fresh Orynx is not set up', async () => {
    const app = await server();
    const res = await app.inject({ method: 'GET', url: apiRoutes.setup, headers });
    expect(SetupStateSchema.parse(res.json())).toEqual({ done: false });
  });

  it('AC-3, AC-5: saves the profile in settings.json and the password as a hash beside it', async () => {
    const folder = await home();
    const password = createPasswordStore(passwordFilePath(folder));
    const app = await server({ settings: createFileSettingsStore(folder), password });

    const res = await app.inject({
      method: 'POST',
      url: apiRoutes.setup,
      headers,
      payload: { profile: ada, password: 'correct horse battery' },
    });

    expect(res.statusCode).toBe(200);
    expect(SetupStateSchema.parse(res.json())).toEqual({ done: true });
    expect(JSON.parse(await readFile(settingsFilePath(folder), 'utf8'))).toMatchObject({ profile: ada });
    expect(await readFile(passwordFilePath(folder), 'utf8')).not.toContain('correct horse');
    expect(await password.verify('correct horse battery')).toBe(true);
    const state = await app.inject({ method: 'GET', url: apiRoutes.setup, headers });
    expect(state.json()).toEqual({ done: true });
  });

  it('AC-2: refuses a setup with no name or a short password, and saves nothing', async () => {
    const password = createPasswordStore();
    const app = await server({ password });

    for (const payload of [
      { profile: makeProfile(), password: 'correct horse battery' },
      { profile: ada, password: 'short' },
    ]) {
      const res = await app.inject({ method: 'POST', url: apiRoutes.setup, headers, payload });
      expect(res.statusCode).toBe(400);
    }
    expect(await password.isSet()).toBe(false);
  });

  it('AC-4: refuses a second setup, even two at once, and keeps the first password and profile', async () => {
    const password = createPasswordStore();
    const app = await server({ password });
    const post = (name: string, secret: string) =>
      app.inject({
        method: 'POST',
        url: apiRoutes.setup,
        headers,
        payload: { profile: { ...ada, name }, password: secret },
      });

    const [first, second] = await Promise.all([post('Ada', 'first password'), post('Mallory', 'second password')]);

    // Whichever ran first wins; the other changes nothing.
    const [won, lost] =
      first.statusCode === 200 ? [['Ada', 'first password'], second] : [['Mallory', 'second password'], first];
    expect(lost.statusCode).toBe(409);
    expect(ApiErrorSchema.parse(lost.json()).code).toBe('already_set_up');
    expect(await password.verify(won[1] ?? '')).toBe(true);
    const profile = await app.inject({ method: 'GET', url: apiRoutes.profile, headers });
    expect(ProfileSchema.parse(profile.json()).name).toBe(won[0]);
  });
});

describe('/api/profile (spec 043)', () => {
  it('AC-6: answers an empty profile until one is saved, then the saved one, after a restart too', async () => {
    const folder = await home();
    const app = await server({ settings: createFileSettingsStore(folder) });
    expect((await app.inject({ method: 'GET', url: apiRoutes.profile, headers })).json()).toEqual(defaultProfile);

    const saved = await app.inject({ method: 'PUT', url: apiRoutes.profile, headers, payload: ada });
    expect(saved.json()).toEqual(ada);

    const restarted = await server({ settings: createFileSettingsStore(folder) });
    expect((await restarted.inject({ method: 'GET', url: apiRoutes.profile, headers })).json()).toEqual(ada);
  });

  it('AC-6: refuses a picture that is not a data URL', async () => {
    const app = await server();
    const res = await app.inject({
      method: 'PUT',
      url: apiRoutes.profile,
      headers,
      payload: { ...ada, picture: 'https://example.com/me.png' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('AC-6: answers an empty profile when settings.json holds one it cannot read', async () => {
    const folder = await home();
    const settings = createFileSettingsStore(folder);
    await settings.update((current) => ({ ...current, profile: { name: 42 } }));
    const app = await server({ settings });
    expect((await app.inject({ method: 'GET', url: apiRoutes.profile, headers })).json()).toEqual(defaultProfile);
  });
});
