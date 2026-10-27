import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, StorageSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createMemoryKeychain } from '../secrets/memory-keychain.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

const servers: FastifyInstance[] = [];
const homes: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

/** A hub on a temporary DEVHUB_HOME whose worktrees folder holds one folder of 1,234 bytes. */
async function server() {
  const home = await mkdtemp(join(tmpdir(), 'devhub-storage-'));
  homes.push(home);
  await mkdir(join(home, 'worktrees', '0000000000000001'), { recursive: true });
  await writeFile(join(home, 'worktrees', '0000000000000001', 'a.txt'), 'x'.repeat(1234));
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    dataDir: home,
    keychain: createMemoryKeychain(),
    settings: createMemorySettingsStore(),
  });
  servers.push(app);
  return app;
}

describe('/api/storage (spec 047, D)', () => {
  it('refuses a request without the session token', async () => {
    const app = await server();
    const response = await app.inject({ method: 'GET', url: apiRoutes.storage, headers: { host: headers.host } });
    expect(response.statusCode).toBe(401);
  });

  it("AC-16: answers with the worktrees' size, and that no session would go yet", async () => {
    const app = await server();
    const response = await app.inject({ method: 'GET', url: apiRoutes.storage, headers });
    expect(response.statusCode).toBe(200);
    expect(StorageSchema.parse(response.json())).toEqual({
      bytes: 1234,
      choices: [7, 14, 30, 90].map((days) => ({ days, sessions: 0, bytes: 0 })),
    });
  });
});
