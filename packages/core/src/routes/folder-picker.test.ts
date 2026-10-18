import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, FolderPickSchema, tokenHeader } from '@devhub/contracts';
import { createServer } from '../create-server.ts';
import { createFolderPicker } from '../folder-picker/folder-picker.ts';
import { useFakePickerFolder, type FakePickerBehaviour } from '../test/fake-picker.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
const fakePicker = useFakePickerFolder();
let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** A server whose macOS picker behaves as asked, for a person whose home is /Users/dev. */
async function serverPicking(behaviour: FakePickerBehaviour) {
  const folder = await fakePicker();
  await folder.install(['osascript'], behaviour);
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    userHome: '/Users/dev',
    folderPicker: createFolderPicker({ searchPath: folder.dir, platform: 'darwin' }),
  });
  return app;
}

describe('POST /api/folder-picker (spec 020)', () => {
  it('answers 401 without the session token', async () => {
    const server = await serverPicking({ kind: 'picks', stdout: '/Users/dev/code/app/' });
    const res = await server.inject({ method: 'POST', url: apiRoutes.folderPicker, headers: { host: headers.host } });
    expect(res.statusCode).toBe(401);
  });

  it('AC-35: answers the folder picked, with ~ for the home folder', async () => {
    const server = await serverPicking({ kind: 'picks', stdout: '/Users/dev/code/intranet-web/\n' });

    const res = await server.inject({ method: 'POST', url: apiRoutes.folderPicker, headers });

    expect(res.statusCode).toBe(200);
    expect(FolderPickSchema.parse(res.json())).toEqual({ path: '~/code/intranet-web' });
  });

  it('AC-35: answers null when the person cancels', async () => {
    const server = await serverPicking({ kind: 'cancels', stderr: 'User canceled. (-128)' });

    const res = await server.inject({ method: 'POST', url: apiRoutes.folderPicker, headers });

    expect(FolderPickSchema.parse(res.json())).toEqual({ path: null });
  });

  it('AC-36: answers 503 picker_unavailable with the line the dialog shows when no picker can open', async () => {
    app = await createServer({ token, port, version: '1.2.3' });

    const res = await app.inject({ method: 'POST', url: apiRoutes.folderPicker, headers });

    expect(res.statusCode).toBe(503);
    expect(ApiErrorSchema.parse(res.json())).toEqual({
      code: 'picker_unavailable',
      message: "Orynx can't open a folder picker on this computer. Type the folder's path instead.",
    });
  });
});
