import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSkillsService } from './skills-service.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function write(path: string, text: string) {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, text);
}

async function setUp() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-skills-service-')));
  roots.push(root);
  const folder = join(root, 'web-app');
  const home = join(root, 'home');
  for (const name of ['a', 'b', 'c', 'd', 'e', 'f']) {
    await write(
      join(folder, `.claude/skills/${name}/SKILL.md`),
      `---\nname: ${name}\ndescription: Skill ${name}\n---\n\nDo ${name}.`,
    );
  }
  await write(join(folder, '.claude/skills/review/SKILL.md'), '---\nname: review\n---\n\nCheck the tests first.');
  await write(join(home, '.claude/commands/standup.md'), 'Write my standup.');
  return { folder, home, service: createSkillsService({ repositories: { list: () => Promise.resolve([]) }, home }) };
}

describe('the skills a message names, at Send (spec 022)', () => {
  it('AC-53: reads each named skill once, in order, without its frontmatter, with its real file and folder', async () => {
    const { folder, home, service } = await setUp();

    const skills = await service.named('Use /review, then /standup, and /review again', folder);

    expect(skills).toEqual([
      {
        name: 'review',
        text: 'Check the tests first.',
        file: join(folder, '.claude/skills/review/SKILL.md'),
        folder: join(folder, '.claude/skills/review'),
      },
      { name: 'standup', text: 'Write my standup.', file: join(home, '.claude/commands/standup.md'), folder: null },
    ]);
  });

  it('AC-54: a /name that’s no skill is only words, and a message names at most 5', async () => {
    const { folder, service } = await setUp();
    expect(await service.named('Try /nope and src/app.ts', folder)).toEqual([]);
    expect((await service.named('/a /b /c /d /e /f', folder)).map((skill) => skill.name)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(await service.named('No slashes here', folder)).toEqual([]);
  });

  it('AC-21 (spec 023): lists your Orynx skills after yours', async () => {
    const { home } = await setUp();
    const orynx = join(home, '..', 'devhub', 'plugin', 'skills');
    await write(
      join(orynx, 'bug-bash/SKILL.md'),
      '---\nname: bug-bash\ndescription: Hunt for bugs\n---\n\nReport only.',
    );
    const service = createSkillsService({ repositories: { list: () => Promise.resolve([]) }, home, orynx });

    expect(await service.list(undefined)).toEqual({
      skills: [
        { name: 'standup', description: null, source: 'yours' },
        { name: 'bug-bash', description: 'Hunt for bugs', source: 'orynx' },
      ],
    });
  });
});
