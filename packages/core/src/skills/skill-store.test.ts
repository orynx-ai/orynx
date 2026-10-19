import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEventBus } from '../events/event-bus.ts';
import { createSkillStore } from './skill-store.ts';

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

function store() {
  return createSkillStore({ devhubHome, home: userHome, events: createEventBus() });
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
