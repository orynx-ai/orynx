import { describe, expect, it } from 'vitest';
import { makeSession } from '@devhub/contracts/testing';
import { createMemorySessionStore, type StoredSession } from '../sessions/session-store.ts';
import { orynxSkillUses } from './skill-uses.ts';

/** A session whose brief named these skills, and these of them from Orynx (none recorded before spec 023). */
function session(id: string, skills: string[], orynxSkills?: string[]): StoredSession {
  return {
    session: makeSession({
      id,
      activities: [
        {
          id: 'step-1',
          state: 'done',
          kind: 'brief',
          key: null,
          tickets: [],
          message: true,
          pullRequests: [],
          files: [],
          skills: skills.map((name) => `/${name}`),
          ...(orynxSkills === undefined ? {} : { orynxSkills }),
        },
      ],
    }),
    repository: { id: '00000000000000aa', path: '/Users/dev/code/web-app' },
    worktree: null,
    startCommit: null,
    claudeSessionId: null,
    pushedCommit: null,
    approvalLog: [],
  };
}

describe('your Orynx skills’ use counts (spec 023)', () => {
  it('AC-24: counts the sessions whose brief named each Orynx skill, once a session', async () => {
    const records = createMemorySessionStore();
    await records.create(session('0000000000000001', ['bug-bash', 'review'], ['bug-bash']));
    await records.create(session('0000000000000002', ['bug-bash'], ['bug-bash']));
    await records.create(session('0000000000000003', ['bug-bash', 'how-we-review'], ['bug-bash', 'how-we-review']));

    expect(Object.fromEntries(await orynxSkillUses(records))).toEqual({ 'bug-bash': 3, 'how-we-review': 1 });
  });

  it('AC-24: leaves out a folder’s skill of the same name, and sessions from before spec 023', async () => {
    const records = createMemorySessionStore();
    await records.create(session('0000000000000001', ['bug-bash'], []));
    await records.create(session('0000000000000002', ['bug-bash']));

    expect(Object.fromEntries(await orynxSkillUses(records))).toEqual({});
  });
});
