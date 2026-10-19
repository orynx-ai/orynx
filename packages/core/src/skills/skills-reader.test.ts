import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readSkills } from './skills-reader.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** A repository folder and a home folder, each with the files given, relative to it. */
async function folders(files: { folder?: Record<string, string>; home?: Record<string, string> }) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'devhub-skills-')));
  roots.push(root);
  const folder = join(root, 'web-app');
  const home = join(root, 'home');
  for (const [base, written] of [
    [folder, files.folder ?? {}],
    [home, files.home ?? {}],
  ] as const) {
    await mkdir(base, { recursive: true });
    for (const [path, text] of Object.entries(written)) {
      await mkdir(join(base, path, '..'), { recursive: true });
      await writeFile(join(base, path), text);
    }
  }
  return { folder, home };
}

const skill = (name: string | null, description: string | null, body = 'Do the thing.') =>
  [
    '---',
    ...(name === null ? [] : [`name: ${name}`]),
    ...(description === null ? [] : [`description: ${description}`]),
    '---',
    '',
    body,
  ].join('\n');

describe('the skills a folder and you have (spec 022)', () => {
  it('AC-49: lists the folder’s skills and commands, then yours, each with its name, description and source', async () => {
    const { folder, home } = await folders({
      folder: {
        '.claude/skills/review/SKILL.md': skill('review', 'Review the branch'),
        '.claude/skills/build/SKILL.md': skill('build', 'Build the next task'),
        '.claude/commands/release/notes.md': skill(null, 'Write the release notes'),
      },
      home: { '.claude/skills/notes/SKILL.md': skill('notes', 'Keep notes') },
    });

    const skills = await readSkills({ folder, home });

    expect(skills.map(({ name, description, source }) => ({ name, description, source }))).toEqual([
      { name: 'build', description: 'Build the next task', source: 'folder' },
      { name: 'release:notes', description: 'Write the release notes', source: 'folder' },
      { name: 'review', description: 'Review the branch', source: 'folder' },
      { name: 'notes', description: 'Keep notes', source: 'yours' },
    ]);
    expect(skills[0]).toMatchObject({
      file: join(folder, '.claude/skills/build/SKILL.md'),
      folder: join(folder, '.claude/skills/build'),
    });
    // A command is a file on its own: Claude may read that file, not the folder it sits in.
    expect(skills[1]).toMatchObject({ file: join(folder, '.claude/commands/release/notes.md'), folder: null });
  });

  it('AC-57: a skill with no name takes its folder’s, one with no description has none, and one that can’t be read is left out', async () => {
    const { folder, home } = await folders({
      folder: {
        '.claude/skills/tidy/SKILL.md': skill(null, 'Tidy up'),
        '.claude/skills/quiet/SKILL.md': skill('quiet', null),
        '.claude/skills/plain/SKILL.md': 'No frontmatter at all.',
        '.claude/skills/broken/SKILL.md': '---\nname: [broken\n---\nBody',
        '.claude/skills/empty-folder/README.md': 'No SKILL.md here.',
        '.claude/skills/Bad Name/SKILL.md': skill('Bad Name', 'A name no / could type'),
        '.claude/skills/long/SKILL.md': skill('long', `>-\n  A description\n  over two lines`),
      },
    });

    const skills = await readSkills({ folder, home });

    expect(skills.map(({ name, description }) => [name, description])).toEqual([
      ['long', 'A description over two lines'],
      ['plain', null],
      ['quiet', null],
      ['tidy', 'Tidy up'],
    ]);
  });

  it('AC-58: the folder’s skill wins over yours with the same name', async () => {
    const { folder, home } = await folders({
      folder: { '.claude/skills/review/SKILL.md': skill('review', 'The repository’s review') },
      home: { '.claude/skills/review/SKILL.md': skill('review', 'Your review') },
    });
    expect(await readSkills({ folder, home })).toMatchObject([
      { name: 'review', description: 'The repository’s review' },
    ]);
  });

  it('AC-55, AC-59: with no folder, only yours; with none anywhere, nothing', async () => {
    const { folder, home } = await folders({ home: { '.claude/commands/standup.md': 'Write my standup.' } });
    expect((await readSkills({ folder: null, home })).map((found) => found.name)).toEqual(['standup']);
    expect(await readSkills({ folder, home: join(folder, 'nobody') })).toEqual([]);
  });

  it('reads only the start of a large file for its frontmatter', async () => {
    const { folder, home } = await folders({
      folder: { '.claude/skills/big/SKILL.md': skill('big', 'A big skill', 'x'.repeat(1024 * 1024)) },
    });
    expect(await readSkills({ folder, home })).toMatchObject([{ name: 'big', description: 'A big skill' }]);
  });

  it('AC-21 (spec 023): lists your Orynx skills after yours, by folder, with no folder Claude may read', async () => {
    const { folder, home } = await folders({
      folder: { '.claude/skills/review/SKILL.md': skill('review', 'The folder’s review') },
      home: { '.claude/skills/notes/SKILL.md': skill('notes', 'Keep notes') },
    });
    const orynx = join(home, '..', 'devhub', 'plugin', 'skills');
    const outside = join(home, '..', 'outside');
    for (const [path, text] of [
      ['bug-bash/SKILL.md', skill('bug-bash', 'Hunt for bugs')],
      ['review/SKILL.md', skill('review', 'My own review')],
      ['notes/SKILL.md', skill('notes', 'My own notes')],
    ] as const) {
      await mkdir(join(orynx, path, '..'), { recursive: true });
      await writeFile(join(orynx, path), text);
    }
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'SKILL.md'), skill('linked', 'Somewhere else'));
    await symlink(outside, join(orynx, 'linked'));

    const skills = await readSkills({ folder, home, orynx });

    // The folder's and yours win on a name; a link is never followed out of the skills folder.
    expect(skills.map(({ name, description, source }) => ({ name, description, source }))).toEqual([
      { name: 'review', description: 'The folder’s review', source: 'folder' },
      { name: 'notes', description: 'Keep notes', source: 'yours' },
      { name: 'bug-bash', description: 'Hunt for bugs', source: 'orynx' },
    ]);
    expect(skills[2]).toEqual({
      name: 'bug-bash',
      description: 'Hunt for bugs',
      source: 'orynx',
      file: join(orynx, 'bug-bash', 'SKILL.md'),
      folder: null,
    });
  });

  it('AC-21 (spec 023): with no Orynx skills folder yet, lists the rest as before', async () => {
    const { home } = await folders({ home: { '.claude/skills/notes/SKILL.md': skill('notes', 'Keep notes') } });

    const skills = await readSkills({ folder: null, home, orynx: join(home, 'nowhere') });

    expect(skills.map((found) => found.name)).toEqual(['notes']);
  });
});
