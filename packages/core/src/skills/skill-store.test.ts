import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerEvent } from '@devhub/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createSkillStore, SkillRejectedError } from './skill-store.ts';
import { starterSkills } from './starters.ts';

let root: string;
let userHome: string;
let devhubHome: string;
let skills: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devhub-skills-'));
  userHome = join(root, 'home');
  devhubHome = join(userHome, '.devhub');
  skills = join(devhubHome, 'plugin', 'skills');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

let published: ServerEvent[];

function store() {
  const events = createEventBus();
  published = [];
  events.subscribe((event) => published.push(event));
  return createSkillStore({ devhubHome, home: userHome, events });
}

const bugBash = { title: 'Bug bash', description: 'Hunt for bugs.', instructions: '# Bug bash\n\nReport only.\n' };

async function mode(path: string) {
  return (await stat(path)).mode & 0o777;
}

async function exists(path: string) {
  return lstat(path).then(
    () => true,
    () => false,
  );
}

/** A skill as a person or an older Orynx left it on disk. */
async function put(folder: string, file: string) {
  await mkdir(join(skills, folder), { recursive: true });
  await writeFile(join(skills, folder, 'SKILL.md'), file);
}

function skillFile(title: string, description = `When to use ${title}.`) {
  return `---\nname: x\ndescription: ${description}\nmetadata:\n  title: ${title}\n---\n\n# ${title}\n`;
}

describe('skill store: reading', () => {
  it('AC-12: lists nothing when the skills folder does not exist yet, and makes no folder', async () => {
    expect(await store().list()).toEqual({ pluginFolder: '~/.devhub/plugin', skills: [] });
  });

  it('AC-2: lists each skill by Name, with its folder, description and instructions', async () => {
    await put('how-we-review', skillFile('How we review'));
    await put('bug-bash', skillFile('Bug bash'));
    await put('write-tests-first', skillFile('write tests first'));

    const list = await store().list();

    expect(list.skills.map((skill) => skill.folder)).toEqual(['bug-bash', 'how-we-review', 'write-tests-first']);
    expect(list.skills[0]).toEqual({
      state: 'ready',
      folder: 'bug-bash',
      title: 'Bug bash',
      description: 'When to use Bug bash.',
      instructions: '# Bug bash\n',
    });
  });

  it('shows the plugin folder in full when DEVHUB_HOME is outside the home folder', async () => {
    devhubHome = join(root, 'elsewhere');
    expect((await store().list()).pluginFolder).toBe(join(root, 'elsewhere', 'plugin'));
  });

  it("AC-17: lists a folder whose SKILL.md is missing, has no frontmatter or is over 64 KB as one Orynx can't read", async () => {
    await mkdir(join(skills, 'empty'), { recursive: true });
    await put('markdown-only', '# Just Markdown\n');
    await put('too-big', skillFile('Too big') + 'x'.repeat(65_536));
    await put('bug-bash', skillFile('Bug bash'));

    const list = await store().list();

    expect(list.skills).toEqual([
      expect.objectContaining({ folder: 'bug-bash', state: 'ready' }),
      { state: 'unreadable', folder: 'empty' },
      { state: 'unreadable', folder: 'markdown-only' },
      { state: 'unreadable', folder: 'too-big' },
    ]);
  });

  it('AC-20: skips links, files, and folders whose name a Name never makes', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'SKILL.md'), skillFile('Outside'));
    await put('bug-bash', skillFile('Bug bash'));
    await symlink(outside, join(skills, 'linked'));
    await mkdir(join(skills, 'linked-file'));
    await symlink(join(outside, 'SKILL.md'), join(skills, 'linked-file', 'SKILL.md'));
    await put('My Skill', skillFile('Mine'));
    await writeFile(join(skills, 'notes.txt'), 'not a skill');

    const list = await store().list();

    expect(list.skills).toEqual([
      expect.objectContaining({ folder: 'bug-bash', state: 'ready' }),
      { state: 'unreadable', folder: 'linked-file' },
    ]);
  });
});

describe('skill store: writing', () => {
  it('AC-5: adds a skill in a 0700 folder as a 0600 SKILL.md, and says skills changed', async () => {
    const skillStore = store();

    expect(await skillStore.add(bugBash)).toEqual({ state: 'ready', folder: 'bug-bash', ...bugBash });

    const file = join(skills, 'bug-bash', 'SKILL.md');
    expect(await readFile(file, 'utf8')).toBe(
      '---\nname: bug-bash\ndescription: Hunt for bugs.\nmetadata:\n  title: Bug bash\n---\n\n# Bug bash\n\nReport only.\n',
    );
    expect(await mode(file)).toBe(0o600);
    for (const folder of [join(skills, 'bug-bash'), skills, join(devhubHome, 'plugin')]) {
      expect(await mode(folder)).toBe(0o700);
    }
    expect(published).toEqual([{ type: 'skills.changed' }]);
    expect((await skillStore.list()).skills).toEqual([{ state: 'ready', folder: 'bug-bash', ...bugBash }]);
  });

  it('AC-7: refuses a Name whose folder another skill has, and writes nothing', async () => {
    await put('bug-bash', skillFile('Bug bash'));
    const skillStore = store();

    await expect(skillStore.add({ ...bugBash, title: 'Bug Bash!' })).rejects.toEqual(
      new SkillRejectedError('You already have a skill in bug-bash.'),
    );

    expect(await readFile(join(skills, 'bug-bash', 'SKILL.md'), 'utf8')).toBe(skillFile('Bug bash'));
    expect(published).toEqual([]);
  });

  it('AC-5, AC-18: saves in place, keeping frontmatter Orynx does not know', async () => {
    await put('bug-bash', '---\nname: bug-bash\ndescription: Old.\nlicense: MIT\n---\n\nOld.\n');
    const skillStore = store();

    const saved = await skillStore.save('bug-bash', { ...bugBash, instructions: 'New.\n' });

    expect(saved).toEqual({ state: 'ready', folder: 'bug-bash', ...bugBash, instructions: 'New.\n' });
    expect(await readFile(join(skills, 'bug-bash', 'SKILL.md'), 'utf8')).toBe(
      '---\nname: bug-bash\ndescription: Hunt for bugs.\nlicense: MIT\nmetadata:\n  title: Bug bash\n---\n\nNew.\n',
    );
    expect(published).toEqual([{ type: 'skills.changed' }]);
  });

  it('AC-6: moves the folder when the Name changes, and names the file after its new folder', async () => {
    await put('bug-bash', skillFile('Bug bash'));
    await writeFile(join(skills, 'bug-bash', 'notes.md'), 'kept');

    const saved = await store().save('bug-bash', { ...bugBash, title: 'Bug hunt' });

    expect(saved?.folder).toBe('bug-hunt');
    expect(await exists(join(skills, 'bug-bash'))).toBe(false);
    expect(await readFile(join(skills, 'bug-hunt', 'SKILL.md'), 'utf8')).toContain('name: bug-hunt\n');
    expect(await readFile(join(skills, 'bug-hunt', 'notes.md'), 'utf8')).toBe('kept');
  });

  it('AC-7: refuses a rename onto another skill, and leaves both as they were', async () => {
    await put('bug-bash', skillFile('Bug bash'));
    await put('bug-hunt', skillFile('Bug hunt'));

    await expect(store().save('bug-bash', { ...bugBash, title: 'Bug hunt' })).rejects.toEqual(
      new SkillRejectedError('You already have a skill in bug-hunt.'),
    );

    expect(await readFile(join(skills, 'bug-bash', 'SKILL.md'), 'utf8')).toBe(skillFile('Bug bash'));
    expect(await readFile(join(skills, 'bug-hunt', 'SKILL.md'), 'utf8')).toBe(skillFile('Bug hunt'));
  });

  it('AC-7: lets one of two saves at once take a folder, and refuses the other', async () => {
    await put('bug-bash', skillFile('Bug bash'));
    await put('bug-hunt-old', skillFile('Old hunt'));
    const skillStore = store();

    const results = await Promise.allSettled([
      skillStore.save('bug-bash', { ...bugBash, title: 'Bug hunt 2' }),
      skillStore.save('bug-hunt-old', { ...bugBash, title: 'Bug hunt 2' }),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((await skillStore.list()).skills.map((skill) => skill.folder)).toEqual(['bug-hunt-2', 'bug-hunt-old']);
  });

  it('AC-16: saves nothing for a folder that went, or that is a link', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await mkdir(skills, { recursive: true });
    await symlink(outside, join(skills, 'linked'));
    const skillStore = store();

    expect(await skillStore.save('gone', bugBash)).toBeNull();
    expect(await skillStore.save('linked', bugBash)).toBeNull();

    expect(await exists(join(outside, 'SKILL.md'))).toBe(false);
    expect(published).toEqual([]);
  });

  it('AC-16: puts the folder back under its old name when the file cannot be written after a rename', async () => {
    // A SKILL.md that is a folder makes the last step, the rename of the new file over it, fail.
    await mkdir(join(skills, 'bug-bash', 'SKILL.md', 'inside'), { recursive: true });
    const skillStore = store();

    await expect(skillStore.save('bug-bash', { ...bugBash, title: 'Bug hunt' })).rejects.toThrow();

    expect(await exists(join(skills, 'bug-bash', 'SKILL.md', 'inside'))).toBe(true);
    expect(await exists(join(skills, 'bug-hunt'))).toBe(false);
    expect((await readdir(join(skills, 'bug-bash'))).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(published).toEqual([]);
  });

  it('AC-10: deletes a skill folder, and leaves a link and what it points to alone', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await put('bug-bash', skillFile('Bug bash'));
    await symlink(outside, join(skills, 'linked'));
    const skillStore = store();

    await skillStore.remove('bug-bash');
    await skillStore.remove('linked');
    await skillStore.remove('gone');

    expect(await exists(join(skills, 'bug-bash'))).toBe(false);
    expect(await readlink(join(skills, 'linked'))).toBe(outside);
    expect(published).toEqual([{ type: 'skills.changed' }]);
  });

  it("AC-13: adds the four starters with the design's words, and keeps a skill already in one of their folders", async () => {
    await put('bug-bash', skillFile('My own bug bash'));
    const skillStore = store();

    await skillStore.addStarters();

    const list = await skillStore.list();
    expect(list.skills.map((skill) => skill.folder)).toEqual([
      'explain-this-code',
      'how-we-review',
      'bug-bash',
      'write-tests-first',
    ]);
    expect(list.skills).toContainEqual({ state: 'ready', ...starterSkills[1] });
    expect(await readFile(join(skills, 'bug-bash', 'SKILL.md'), 'utf8')).toBe(skillFile('My own bug bash'));
    expect(published).toEqual([{ type: 'skills.changed' }]);
  });

  it('the starters are Bug bash, How we review, Write tests first and Explain this code', () => {
    expect(starterSkills.map((skill) => skill.title)).toEqual([
      'Bug bash',
      'How we review',
      'Write tests first',
      'Explain this code',
    ]);
    expect(starterSkills[0]?.instructions).toContain('Do not change any code. Report only.');
  });
});
