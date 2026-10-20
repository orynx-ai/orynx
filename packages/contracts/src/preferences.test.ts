import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  defaultPreferences,
  EditorSchema,
  InboxRuleIdSchema,
  permissionsFor,
  permissionsFromMode,
  PermissionsSchema,
  PreferencesChangeSchema,
  PreferencesSchema,
  ServerEventSchema,
} from './index.ts';
import { makePreferences } from './testing.ts';

describe('PreferencesSchema', () => {
  it('spec 026: one row for each kind of call, each with its choices', () => {
    expect(
      Object.fromEntries(Object.entries(PermissionsSchema.shape).map(([row, choice]) => [row, choice.options])),
    ).toEqual({
      edits: ['ask', 'allow'],
      commands: ['ask', 'allowed_list', 'any'],
      network: ['ask', 'allow'],
      deleteOutside: ['ask', 'allow'],
      unsandboxed: ['ask', 'allow'],
      push: ['never', 'ask', 'allow'],
      pullRequest: ['never', 'ask', 'allow'],
    });
  });

  it('spec 026: carries an older saved mode over to the rows, every other row at its default', () => {
    expect(permissionsFromMode('edit_freely_ask_commands')).toEqual(defaultPreferences.permissions);
    expect(permissionsFromMode('ask_everything')).toEqual({ ...defaultPreferences.permissions, edits: 'ask' });
    expect(permissionsFromMode('edit_and_run_allowed')).toEqual({
      ...defaultPreferences.permissions,
      commands: 'allowed_list',
    });
  });

  it('AC-2, AC-12: starts as "Edit files freely, ask before commands" did, never pushing, with every inbox rule on', () => {
    expect(defaultPreferences).toEqual({
      permissions: {
        edits: 'allow',
        commands: 'ask',
        network: 'ask',
        deleteOutside: 'ask',
        unsandboxed: 'ask',
        push: 'never',
        pullRequest: 'never',
      },
      repositoryPermissions: {},
      inboxRules: {
        jira_assigned: true,
        review_requested: true,
        checks_failing: true,
        unresolved_comments: true,
        session_waiting: true,
      },
      allowedCommands: [],
      editor: 'vscode',
    });
    expect(PreferencesSchema.parse(defaultPreferences)).toEqual(defaultPreferences);
  });

  it('013 AC-20, AC-26: offers VS Code and Cursor as the editor, VS Code first', () => {
    expect(EditorSchema.options).toEqual(['vscode', 'cursor']);
    expect(PreferencesSchema.parse(makePreferences({ editor: 'cursor' })).editor).toBe('cursor');
    expect(PreferencesSchema.safeParse({ ...defaultPreferences, editor: 'zed' }).success).toBe(false);
  });

  it('AC-15: lists the allowed commands as saved, and refuses an empty entry', () => {
    const list = makePreferences({ allowedCommands: ['npm test', 'pnpm lint'] });
    expect(PreferencesSchema.parse(list).allowedCommands).toEqual(['npm test', 'pnpm lint']);
    expect(PreferencesSchema.safeParse({ ...defaultPreferences, allowedCommands: [''] }).success).toBe(false);
  });

  it('AC-12: has five rules until Slack joins in spec 016 (Q6)', () => {
    expect(InboxRuleIdSchema.options).toHaveLength(5);
    expect(InboxRuleIdSchema.options.some((rule) => rule.includes('slack'))).toBe(false);
  });

  it('refuses preferences with a rule missing, so the server always answers with all of them', () => {
    const { session_waiting: _left, ...fourRules } = defaultPreferences.inboxRules;
    expect(PreferencesSchema.safeParse({ ...defaultPreferences, inboxRules: fourRules }).success).toBe(false);
  });

  it('builds valid preferences for tests', () => {
    expect(makePreferences()).toEqual(defaultPreferences);
    expect(makePreferences({ permissions: { push: 'ask' } }).permissions).toEqual({
      ...defaultPreferences.permissions,
      push: 'ask',
    });
    expect(makePreferences({ inboxRules: { checks_failing: false } }).inboxRules).toEqual({
      ...defaultPreferences.inboxRules,
      checks_failing: false,
    });
  });
});

describe('PreferencesChangeSchema', () => {
  it('AC-3, AC-13, spec 026: takes only the rows or the rules that changed', () => {
    expect(PreferencesChangeSchema.parse({ permissions: { push: 'allow' } })).toEqual({
      permissions: { push: 'allow' },
    });
    expect(PreferencesChangeSchema.parse({ inboxRules: { checks_failing: false } })).toEqual({
      inboxRules: { checks_failing: false },
    });
  });

  it('AC-5, AC-15: takes one command to allow, read as Settings reads it, or one to take off the list', () => {
    expect(PreferencesChangeSchema.parse({ allowCommand: '  npm   test ' })).toEqual({ allowCommand: 'npm test' });
    expect(PreferencesChangeSchema.parse({ disallowCommand: 'npm test' })).toEqual({ disallowCommand: 'npm test' });
    const refused = PreferencesChangeSchema.safeParse({ allowCommand: 'git push' });
    expect(refused.success).toBe(false);
    expect(refused.error?.issues[0]?.message).toBe("git push always asks, so it can't go on the list.");
  });

  it('041: changes a repository’s own rows, or sends it back to All repositories', () => {
    const repository = '0123456789abcdef';
    expect(PreferencesChangeSchema.parse({ permissions: { push: 'never' }, repository })).toEqual({
      permissions: { push: 'never' },
      repository,
    });
    expect(PreferencesChangeSchema.parse({ followAll: repository })).toEqual({ followAll: repository });
    expect(PreferencesChangeSchema.safeParse({ repository }).success).toBe(false);
    expect(PreferencesChangeSchema.safeParse({ permissions: { push: 'never' }, repository: 'orynx' }).success).toBe(
      false,
    );
  });

  it('013 AC-26: takes the editor alone', () => {
    expect(PreferencesChangeSchema.parse({ editor: 'cursor' })).toEqual({ editor: 'cursor' });
    expect(PreferencesChangeSchema.safeParse({ editor: 'zed' }).success).toBe(false);
  });

  it('refuses an empty change, the old mode, an unknown row or choice, an unknown rule and an unknown key', () => {
    for (const body of [
      {},
      { permissionMode: 'ask_everything' },
      { permissions: { push: 'yes' } },
      { permissions: { commands: 'everything' } },
      { permissions: { sudo: 'allow' } },
      { inboxRules: { slack_no_reply: false } },
      { inboxRules: { checks_failing: 'no' } },
      { allowCommand: '' },
      { allowCommand: 'npm test && npm run lint' },
      { disallowCommand: '' },
      { theme: 'dark' },
    ]) {
      expect(PreferencesChangeSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('lives at /api/preferences', () => {
    expect(apiRoutes.preferences).toBe('/api/preferences');
  });
});

describe('permissionsFor', () => {
  it('041: a repository with its own rows follows them; any other, or none, follows All repositories', () => {
    const own = { ...defaultPreferences.permissions, push: 'allow' } as const;
    const preferences = makePreferences({ repositoryPermissions: { '0123456789abcdef': own } });
    expect(permissionsFor(preferences, '0123456789abcdef')).toEqual(own);
    expect(permissionsFor(preferences, 'fedcba9876543210')).toEqual(defaultPreferences.permissions);
    expect(permissionsFor(preferences, null)).toEqual(defaultPreferences.permissions);
  });
});

describe('the settings.changed event', () => {
  it('AC-17: is one the client knows, so another tab can refetch', () => {
    expect(ServerEventSchema.parse({ type: 'settings.changed' })).toEqual({ type: 'settings.changed' });
  });
});
