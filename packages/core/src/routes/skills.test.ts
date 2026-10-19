import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiRoutes, ApiErrorSchema, SkillListSchema, tokenHeader } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { createServer } from '../create-server.ts';
import { createMemorySettingsStore } from '../settings/settings-store.ts';

const token = 'test-token-0123456789';
const port = 4317;
const headers = { host: `127.0.0.1:${String(port)}`, [tokenHeader]: token };
let app: FastifyInstance | undefined;
const roots: string[] = [];

afterEach(async () => {
  await app?.close();
  app = undefined;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function write(path: string, text: string) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}

/** A hub whose one folder, web-app, has a review skill, and whose home has a notes skill and a standup command. */
async function serverWithSkills() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-skills-route-')));
  roots.push(root);
  const folder = join(root, 'web-app');
  const home = join(root, 'home');
  await write(
    join(folder, '.claude/skills/review/SKILL.md'),
    '---\nname: review\ndescription: Review the branch\n---\nBody',
  );
  await write(join(home, '.claude/skills/notes/SKILL.md'), '---\ndescription: Keep notes\n---\nBody');
  await write(join(home, '.claude/commands/standup.md'), 'Write my standup.');
  const web = makeRepository({ id: '00000000000000aa', name: 'web-app', path: folder });
  app = await createServer({
    token,
    port,
    version: '1.2.3',
    userHome: home,
    settings: createMemorySettingsStore({ repositories: [{ id: web.id, path: folder, jiraProject: null }] }),
  });
  return app;
}

describe('GET /api/skills (spec 022)', () => {
  it('answers 401 without the session token', async () => {
    const server = await serverWithSkills();
    const res = await server.inject({ method: 'GET', url: apiRoutes.skills, headers: { host: headers.host } });
    expect(res.statusCode).toBe(401);
  });

  it('AC-49, AC-59: lists the folder’s skills, then yours', async () => {
    const server = await serverWithSkills();
    const res = await server.inject({
      method: 'GET',
      url: `${apiRoutes.skills}?repositoryId=00000000000000aa`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expect(SkillListSchema.parse(res.json())).toEqual({
      skills: [
        { name: 'review', description: 'Review the branch', source: 'folder' },
        { name: 'notes', description: 'Keep notes', source: 'yours' },
        { name: 'standup', description: null, source: 'yours' },
      ],
    });
  });

  it('AC-59: without a folder, yours alone; an unknown folder is 404', async () => {
    const server = await serverWithSkills();
    const yours = await server.inject({ method: 'GET', url: apiRoutes.skills, headers });
    expect(SkillListSchema.parse(yours.json()).skills.map((skill) => skill.name)).toEqual(['notes', 'standup']);

    const gone = await server.inject({
      method: 'GET',
      url: `${apiRoutes.skills}?repositoryId=00000000000000bb`,
      headers,
    });
    expect(gone.statusCode).toBe(404);
    expect(ApiErrorSchema.parse(gone.json()).code).toBe('not_found');
  });
});
