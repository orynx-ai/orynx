import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  ApiErrorCodeSchema,
  folderFromName,
  SaveSkillRequestSchema,
  ServerEventSchema,
  SkillEntrySchema,
  SkillFolderSchema,
  skillLimits,
  OrynxSkillListSchema,
} from './index.ts';
import { makeOrynxSkill, makeOrynxSkillList } from './testing.ts';

function messages(input: unknown): string[] {
  const result = SaveSkillRequestSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

const valid = { title: 'Bug bash', description: 'Hunt for bugs.', instructions: '# Bug bash\n\nReport only.' };

describe('folderFromName', () => {
  it('AC-6: makes the folder from the Name: lowercase, with one - for each run of other characters', () => {
    expect(folderFromName('Bug bash')).toBe('bug-bash');
    expect(folderFromName('Bug hunt')).toBe('bug-hunt');
    expect(folderFromName('  PR   Review!! ')).toBe('pr-review');
    expect(folderFromName('How we review: v2')).toBe('how-we-review-v2');
  });

  it('drops accents', () => {
    expect(folderFromName('Écrire des tests')).toBe('ecrire-des-tests');
  });

  it('AC-8: makes nothing from a Name with no letter or digit', () => {
    expect(folderFromName('!!!')).toBe('');
    expect(folderFromName('   ')).toBe('');
  });

  it('keeps at most 64 characters, with no - at the end', () => {
    const folder = folderFromName(`${'a'.repeat(63)} b`);
    expect(folder).toBe('a'.repeat(63));
    expect(folderFromName('x'.repeat(80))).toHaveLength(64);
  });
});

describe('SkillFolderSchema', () => {
  it("takes Claude Code's skill names", () => {
    for (const folder of ['bug-bash', 'write-tests-first', 'v2', 'a'.repeat(64)]) {
      expect(SkillFolderSchema.safeParse(folder).success).toBe(true);
    }
  });

  it('AC-20: refuses anything that could leave the skills folder or that a Name never makes', () => {
    for (const folder of ['../x', 'a/b', 'Bug Bash', 'bug_bash', '-bug', 'bug-', 'bug--bash', '', 'a'.repeat(65)]) {
      expect(SkillFolderSchema.safeParse(folder).success).toBe(false);
    }
  });
});

describe('SaveSkillRequestSchema', () => {
  it('AC-5: takes a Name, when to use it and the instructions, trimming the first two', () => {
    expect(SaveSkillRequestSchema.parse({ ...valid, title: '  Bug bash ', description: ' Hunt. ' })).toEqual({
      ...valid,
      description: 'Hunt.',
    });
  });

  it('AC-8: says why a Name is refused', () => {
    expect(messages({ ...valid, title: ' ' })).toEqual(['Give the skill a name.']);
    expect(messages({ ...valid, title: '!!!' })).toEqual(['Use at least one letter or digit.']);
    expect(messages({ ...valid, title: 'x'.repeat(65) })).toEqual(['At most 64 characters.']);
  });

  it('AC-8: says why the other fields are refused', () => {
    expect(messages({ ...valid, description: '' })).toEqual(['Say when to use it.']);
    expect(messages({ ...valid, description: 'x'.repeat(1025) })).toEqual(['At most 1,024 characters.']);
    expect(messages({ ...valid, instructions: ' \n ' })).toEqual(['Write the instructions.']);
    expect(messages({ ...valid, instructions: 'x'.repeat(20_001) })).toEqual(['At most 20,000 characters.']);
  });

  it("uses Claude Code's limits", () => {
    expect(skillLimits).toEqual({ title: 64, description: 1024, instructions: 20_000, fileBytes: 65_536 });
  });
});

describe('OrynxSkillListSchema', () => {
  it('AC-2: holds the plugin folder as the page bar shows it, and each skill', () => {
    const list = makeOrynxSkillList();
    expect(OrynxSkillListSchema.parse(list)).toEqual({
      pluginFolder: '~/.devhub/plugin',
      skills: [makeOrynxSkill()],
    });
    expect(makeOrynxSkill()).toEqual({
      state: 'ready',
      folder: 'bug-bash',
      title: 'Bug bash',
      description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
      instructions: expect.stringContaining('# Bug bash') as string,
    });
  });

  it("AC-17: holds a skill Orynx can't read by its folder alone", () => {
    expect(SkillEntrySchema.parse({ state: 'unreadable', folder: 'broken' })).toEqual({
      state: 'unreadable',
      folder: 'broken',
    });
  });
});

describe('skills on the wire', () => {
  it('has a path for the list, one skill and the starters', () => {
    expect(apiRoutes.orynxSkills).toBe('/api/skills/orynx');
    expect(apiRoutes.orynxSkill).toBe('/api/skills/orynx/:folder');
    expect(apiRoutes.orynxSkillStarters).toBe('/api/skills/orynx/starters');
  });

  it('AC-19: tells the app when skills change', () => {
    expect(ServerEventSchema.parse({ type: 'skills.changed' })).toEqual({ type: 'skills.changed' });
  });

  it('AC-7: has an error for a refused skill', () => {
    expect(ApiErrorCodeSchema.parse('skill_rejected')).toBe('skill_rejected');
  });
});
