import { lstat, mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  apiRoutes,
  ApiErrorSchema,
  ReadySkillSchema,
  OrynxSkillListSchema,
  tokenHeader,
  type ServerEvent,
} from '@devhub/contracts';
import { createServer, type CoreOptions } from '../create-server.ts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };

let root: string;
let home: string;
let dataDir: string;
let skills: string;
const servers: FastifyInstance[] = [];

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-skill-routes-')));
  home = join(root, 'home');
  dataDir = join(home, '.devhub');
  skills = join(dataDir, 'plugin', 'skills');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  await rm(dataDir, { recursive: true, force: true });
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function server(options: Partial<CoreOptions> = {}) {
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  const app = await createServer({
    token,
    port,
    version: '1.2.3',
    events,
    settings: createMemorySettingsStore(),
    userHome: home,
    dataDir,
    ...options,
  });
  servers.push(app);
  return { app, seen };
}

const bugBash = {
  title: 'Bug bash',
  description: 'Secret-sounding description for the log check.',
  instructions: '# Bug bash\n\nInstructions nobody should log.\n',
};

function skillUrl(folder: string): string {
  return apiRoutes.orynxSkill.replace(':folder', folder);
}

async function exists(path: string) {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

describe('/api/skills/orynx', () => {
  it('answers 401 without the session token', async () => {
    const { app } = await server();
    for (const [method, url] of [
      ['GET', apiRoutes.orynxSkills],
      ['POST', apiRoutes.orynxSkills],
      ['POST', apiRoutes.orynxSkillStarters],
      ['PUT', skillUrl('bug-bash')],
      ['DELETE', skillUrl('bug-bash')],
    ] as const) {
      const response = await app.inject({ method, url, headers: { host: headers.host } });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('AC-12: lists no skills, with the plugin folder under ~, before any is added', async () => {
    const { app } = await server();
    const response = await app.inject({ method: 'GET', url: apiRoutes.orynxSkills, headers });
    expect(response.statusCode).toBe(200);
    expect(OrynxSkillListSchema.parse(response.json())).toEqual({ pluginFolder: '~/.devhub/plugin', skills: [] });
  });

  it('AC-5: adds a skill, answers with it, lists it and says skills changed', async () => {
    const { app, seen } = await server();

    const added = await app.inject({ method: 'POST', url: apiRoutes.orynxSkills, headers, payload: bugBash });

    expect(added.statusCode).toBe(201);
    expect(ReadySkillSchema.parse(added.json())).toEqual({ state: 'ready', folder: 'bug-bash', ...bugBash });
    expect(await readFile(join(skills, 'bug-bash', 'SKILL.md'), 'utf8')).toContain('title: Bug bash');
    expect(seen).toContainEqual({ type: 'skills.changed' });
    const list = await app.inject({ method: 'GET', url: apiRoutes.orynxSkills, headers });
    expect(OrynxSkillListSchema.parse(list.json()).skills).toHaveLength(1);
  });

  it('AC-8: refuses fields the contract refuses, with 400', async () => {
    const { app } = await server();
    const response = await app.inject({
      method: 'POST',
      url: apiRoutes.orynxSkills,
      headers,
      payload: { ...bugBash, title: '!!!' },
    });
    expect(response.statusCode).toBe(400);
    expect(ApiErrorSchema.parse(response.json()).code).toBe('bad_request');
    expect(await exists(skills)).toBe(false);
  });

  it('AC-7: answers 422 with the words for Name when another skill has the folder', async () => {
    const { app } = await server();
    await app.inject({ method: 'POST', url: apiRoutes.orynxSkills, headers, payload: bugBash });

    const again = await app.inject({
      method: 'POST',
      url: apiRoutes.orynxSkills,
      headers,
      payload: { ...bugBash, title: 'BUG BASH' },
    });

    expect(again.statusCode).toBe(422);
    expect(again.json()).toEqual({ code: 'skill_rejected', message: 'You already have a skill in bug-bash.' });
  });

  it('AC-6: saves under the folder the new Name makes', async () => {
    const { app } = await server();
    await app.inject({ method: 'POST', url: apiRoutes.orynxSkills, headers, payload: bugBash });

    const saved = await app.inject({
      method: 'PUT',
      url: skillUrl('bug-bash'),
      headers,
      payload: { ...bugBash, title: 'Bug hunt' },
    });

    expect(saved.statusCode).toBe(200);
    expect(ReadySkillSchema.parse(saved.json()).folder).toBe('bug-hunt');
    expect(await exists(join(skills, 'bug-bash'))).toBe(false);
  });

  it('AC-16: answers 404 when the skill went', async () => {
    const { app } = await server();
    const response = await app.inject({ method: 'PUT', url: skillUrl('gone'), headers, payload: bugBash });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'not_found', message: 'This skill is no longer in the folder.' });
  });

  it('AC-20: refuses a folder a Name never makes, and touches nothing outside the skills folder', async () => {
    const { app } = await server();
    await mkdir(join(dataDir, 'x'), { recursive: true });
    for (const folder of ['Bug%20Bash', '..%2Fx', 'bug_bash']) {
      const put = await app.inject({ method: 'PUT', url: skillUrl(folder), headers, payload: bugBash });
      const remove = await app.inject({ method: 'DELETE', url: skillUrl(folder), headers });
      expect(put.statusCode, folder).toBe(400);
      expect(remove.statusCode, folder).toBe(400);
    }
    // A bare `..` is resolved before routing, so it reaches no skill route at all.
    expect((await app.inject({ method: 'DELETE', url: skillUrl('..'), headers })).statusCode).toBe(404);
    expect(await exists(join(dataDir, 'x'))).toBe(true);
  });

  it('AC-10: deletes a skill', async () => {
    const { app, seen } = await server();
    await app.inject({ method: 'POST', url: apiRoutes.orynxSkills, headers, payload: bugBash });

    const response = await app.inject({ method: 'DELETE', url: skillUrl('bug-bash'), headers });

    expect(response.statusCode).toBe(204);
    expect(await exists(join(skills, 'bug-bash'))).toBe(false);
    expect(seen.filter((event) => event.type === 'skills.changed')).toHaveLength(2);
  });

  it('AC-13: adds the starter skills', async () => {
    const { app } = await server();

    const response = await app.inject({ method: 'POST', url: apiRoutes.orynxSkillStarters, headers });

    expect(response.statusCode).toBe(204);
    const list = OrynxSkillListSchema.parse(
      (await app.inject({ method: 'GET', url: apiRoutes.orynxSkills, headers })).json(),
    );
    expect(list.skills.map((skill) => skill.folder)).toEqual([
      'bug-bash',
      'explain-this-code',
      'how-we-review',
      'write-tests-first',
    ]);
  });

  it("AC-28: logs a skill's folder at most, never its Name, description or instructions", async () => {
    const log: string[] = [];
    const { app } = await server({
      logger: {
        level: 'trace',
        stream: new Writable({
          write(chunk: Buffer, _encoding, done) {
            log.push(chunk.toString());
            done();
          },
        }),
      },
    });

    await app.inject({ method: 'POST', url: apiRoutes.orynxSkills, headers, payload: bugBash });
    await app.inject({ method: 'PUT', url: skillUrl('bug-bash'), headers, payload: { ...bugBash, title: 'Bug hunt' } });
    await app.inject({
      method: 'POST',
      url: apiRoutes.orynxSkills,
      headers,
      payload: { ...bugBash, title: 'Bug hunt' },
    });
    await app.inject({ method: 'DELETE', url: skillUrl('bug-hunt'), headers });

    const written = log.join('');
    expect(written).toContain('/api/skills/orynx/bug-hunt');
    for (const secret of ['Bug bash', 'Bug hunt', bugBash.description, 'Instructions nobody should log']) {
      expect(written).not.toContain(secret);
    }
  });
});
