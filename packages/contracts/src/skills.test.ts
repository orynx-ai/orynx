import { describe, expect, it } from 'vitest';
import { apiRoutes, SkillListQuerySchema, SkillListSchema, SkillNameSchema, skillsNamedIn } from './index.ts';

describe('skills (spec 022)', () => {
  it('AC-49: lists each skill’s name, description and where it’s from', () => {
    const list = { skills: [{ name: 'review', description: 'Review the branch', source: 'folder' }] };
    expect(SkillListSchema.parse(list)).toEqual(list);
    expect(SkillListSchema.safeParse({ skills: [{ name: 'x', description: null, source: 'plugin' }] }).success).toBe(
      false,
    );
  });

  it('takes only names a / can be typed with', () => {
    for (const name of ['review', 'release:notes', 'build-a-screen', 'v2.check']) {
      expect(SkillNameSchema.safeParse(name).success).toBe(true);
    }
    for (const name of ['', 'Bad Name', '-dash', 'a/b', 'x'.repeat(65)]) {
      expect(SkillNameSchema.safeParse(name).success).toBe(false);
    }
  });

  it('is asked for with the folder, or without one', () => {
    expect(SkillListQuerySchema.parse({ repositoryId: '00000000000000aa' })).toEqual({
      repositoryId: '00000000000000aa',
    });
    expect(SkillListQuerySchema.parse({})).toEqual({});
    expect(SkillListQuerySchema.safeParse({ repositoryId: '../x' }).success).toBe(false);
    expect(apiRoutes.skills).toBe('/api/skills');
  });
});

describe('the skills a message names (spec 022)', () => {
  it('AC-53, AC-54: finds /name at the start or after a space or line, each once, in order', () => {
    expect(skillsNamedIn('/review the auth change, then /build.\n/review again and /release:notes:')).toEqual([
      'review',
      'build',
      'release:notes',
    ]);
    expect(skillsNamedIn('Open src/app/main.ts and https://x.dev/path, not a/skill')).toEqual([]);
    expect(skillsNamedIn('Try /nope')).toEqual(['nope']);
  });
});
