import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, FileCheckAnswerSchema, FilePicksSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createFilePicker } from '../folder-picker/folder-picker.ts';
import { useFakePickerFolder, type FakePickerBehaviour } from '../test/fake-picker.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const fakePicker = useFakePickerFolder();
let app: FastifyInstance | undefined;
const homes: string[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

/** A server whose macOS file picker behaves as asked, for a person whose home is /Users/dev. */
async function serverPicking(behaviour: FakePickerBehaviour) {
  const folder = await fakePicker();
  await folder.install(['osascript'], behaviour);
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    userHome: '/Users/dev',
    filePicker: createFilePicker({ searchPath: folder.dir, platform: 'darwin' }),
  });
  return app;
}

describe('POST /api/file-picker (spec 022)', () => {
  it('answers 401 without the session token', async () => {
    const server = await serverPicking({ kind: 'picks', stdout: '["/Users/dev/a.md"]' });
    const res = await server.inject({ method: 'POST', url: apiRoutes.filePicker, headers: { host: headers.host } });
    expect(res.statusCode).toBe(401);
  });

  it('AC-9, AC-10: answers every file picked, with ~ for the home folder, of any kind', async () => {
    const server = await serverPicking({
      kind: 'picks',
      stdout: '["/Users/dev/Movies/demo.mov","/Users/dev/notes/plan.pdf","/tmp/shot.png"]',
    });

    const res = await server.inject({ method: 'POST', url: apiRoutes.filePicker, headers });

    expect(res.statusCode).toBe(200);
    expect(FilePicksSchema.parse(res.json())).toEqual({
      paths: ['~/Movies/demo.mov', '~/notes/plan.pdf', '/tmp/shot.png'],
    });
  });

  it('AC-11: answers null for Cancel, and leaves out a path the composer can’t hold', async () => {
    const cancelled = await serverPicking({ kind: 'fails', exitCode: 1, stderr: 'User canceled. (-128)' });
    expect(
      FilePicksSchema.parse((await cancelled.inject({ method: 'POST', url: apiRoutes.filePicker, headers })).json()),
    ).toEqual({
      paths: null,
    });
    await app?.close();

    const odd = await serverPicking({ kind: 'picks', stdout: '["/Users/dev/odd\\nname","/Users/dev/a.md"]' });
    expect((await odd.inject({ method: 'POST', url: apiRoutes.filePicker, headers })).json()).toEqual({
      paths: ['~/a.md'],
    });
  });

  it('AC-12: answers 503 picker_unavailable with the line the composer shows when no picker can open', async () => {
    app = await createServer({ token, port, version: '1.2.3' });

    const res = await app.inject({ method: 'POST', url: apiRoutes.filePicker, headers });

    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'picker_unavailable',
      message: "Orynx can't open a file picker on this computer. Type the file's path instead.",
    });
  });
});

describe('POST /api/files/check (spec 022)', () => {
  async function serverWithHome() {
    const home = await realpath(await mkdtemp(join(tmpdir(), 'devhub-files-home-')));
    homes.push(home);
    await mkdir(join(home, 'notes'));
    await writeFile(join(home, 'notes', 'plan.pdf'), '%PDF-1.7');
    app = await createServer({ token, port, version: '1.2.3', userHome: home });
    return { app, home };
  }

  it('AC-12: finds a typed file from ~ or from /, and answers it with ~', async () => {
    const { app: server, home } = await serverWithHome();
    for (const path of ['~/notes/plan.pdf', join(home, 'notes', 'plan.pdf')]) {
      const res = await server.inject({ method: 'POST', url: apiRoutes.fileCheck, headers, payload: { path } });
      expect(FileCheckAnswerSchema.parse(res.json())).toEqual({ result: 'found', path: '~/notes/plan.pdf' });
    }
  });

  it('AC-12, AC-16: a folder, or nothing there, is not a file', async () => {
    const { app: server } = await serverWithHome();
    for (const path of ['~/notes', '~/notes/gone.pdf']) {
      const res = await server.inject({ method: 'POST', url: apiRoutes.fileCheck, headers, payload: { path } });
      expect(res.json()).toEqual({ result: 'not_found' });
    }
    const relative = await server.inject({
      method: 'POST',
      url: apiRoutes.fileCheck,
      headers,
      payload: { path: 'notes/plan.pdf' },
    });
    expect(relative.statusCode).toBe(400);
  });
});
