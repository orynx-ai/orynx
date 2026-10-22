import { describe, expect, it } from 'vitest';
import { defaultPreferences, type ServerEvent } from '@devhub/contracts';
import { createEventBus } from '../events/event-bus.ts';
import { createMemorySettingsStore, type Settings } from '../settings/settings-store.ts';
import { createPreferencesService } from './preferences-service.ts';

const jira = { site: 'your-team.atlassian.net', email: 'dev@example.com' };

function service(initial: Settings = {}) {
  const settings = createMemorySettingsStore(initial);
  const events = createEventBus();
  const seen: ServerEvent[] = [];
  events.subscribe((event) => seen.push(event));
  return { preferences: createPreferencesService({ settings, events }), settings, seen };
}

describe('preferences service', () => {
  it('AC-2, AC-12: answers with the defaults when nothing was ever chosen', async () => {
    expect(await service().preferences.read()).toEqual(defaultPreferences);
  });

  it('AC-3, spec 026: saves a row that changed, writing every row, and says settings changed', async () => {
    const { preferences, settings, seen } = service();

    const answer = await preferences.change({ permissions: { push: 'ask' } });

    expect(answer.permissions).toEqual({ ...defaultPreferences.permissions, push: 'ask' });
    expect((await settings.read()).agent).toEqual({ permissions: { ...defaultPreferences.permissions, push: 'ask' } });
    expect(await preferences.read()).toEqual(answer);
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('spec 026: carries a mode an older Orynx saved over to the rows, and keeps it as written until a row changes', async () => {
    const { preferences, settings } = service({ agent: { permissionMode: 'ask_everything' } });
    expect((await preferences.read()).permissions).toEqual({ ...defaultPreferences.permissions, edits: 'ask' });

    const answer = await preferences.change({ permissions: { commands: 'any' } });

    expect(answer.permissions).toEqual({ ...defaultPreferences.permissions, edits: 'ask', commands: 'any' });
    expect((await settings.read()).agent).toEqual({
      permissionMode: 'ask_everything',
      permissions: { ...defaultPreferences.permissions, edits: 'ask', commands: 'any' },
    });
  });

  it('spec 026: reads each row it can, and falls back on the others, keeping what it cannot read', async () => {
    const { preferences, settings } = service({
      agent: {
        permissionMode: 'edit_and_run_allowed',
        permissions: { push: 'allow', network: 'sometimes', sudo: 'allow' },
      },
    });
    expect((await preferences.read()).permissions).toEqual({
      ...defaultPreferences.permissions,
      commands: 'allowed_list',
      push: 'allow',
    });
    await preferences.change({ editor: 'cursor' });
    expect((await settings.read()).agent).toMatchObject({ permissions: { network: 'sometimes', sudo: 'allow' } });
  });

  it('041: a repository’s first change copies All repositories’ rows, then All’s changes leave it alone', async () => {
    const repository = '0123456789abcdef';
    const { preferences, settings, seen } = service({ agent: { permissions: { push: 'ask' } } });

    const own = await preferences.change({ permissions: { push: 'never' }, repository });
    expect(own.repositoryPermissions).toEqual({
      [repository]: { ...defaultPreferences.permissions, push: 'never' },
    });
    expect(own.permissions.push).toBe('ask');

    const all = await preferences.change({ permissions: { push: 'allow', edits: 'ask' } });
    expect(all.permissions).toMatchObject({ push: 'allow', edits: 'ask' });
    expect(all.repositoryPermissions[repository]).toEqual({ ...defaultPreferences.permissions, push: 'never' });
    expect(await preferences.read()).toEqual(all);
    expect(seen).toEqual([{ type: 'settings.changed' }, { type: 'settings.changed' }]);

    const back = await preferences.change({ followAll: repository });
    expect(back.repositoryPermissions).toEqual({});
    expect((await settings.read()).agent).toMatchObject({ repositoryPermissions: {} });
  });

  it('041: reads a repository’s rows it can, falls back on All’s for the others, and drops a key that isn’t an id', async () => {
    const { preferences } = service({
      agent: {
        permissions: { edits: 'ask' },
        repositoryPermissions: {
          '0123456789abcdef': { push: 'allow', network: 'sometimes' },
          orynx: { push: 'allow' },
        },
      },
    });
    expect((await preferences.read()).repositoryPermissions).toEqual({
      '0123456789abcdef': { ...defaultPreferences.permissions, edits: 'ask', push: 'allow' },
    });
  });

  it('AC-13: saves only the rule that changed, so the others keep their own values', async () => {
    const { preferences, settings } = service();

    await preferences.change({ inboxRules: { checks_failing: false } });
    const answer = await preferences.change({ inboxRules: { review_requested: false } });

    expect(answer.inboxRules).toEqual({
      ...defaultPreferences.inboxRules,
      checks_failing: false,
      review_requested: false,
    });
    expect((await settings.read()).inbox).toEqual({ rules: { checks_failing: false, review_requested: false } });
  });

  it('012 AC-5, AC-15: adds a command to the allow list once, in the order added, and says settings changed', async () => {
    const { preferences, settings, seen } = service();
    await preferences.change({ allowCommand: 'npm test' });
    await preferences.change({ allowCommand: 'pnpm lint' });
    const answer = await preferences.change({ allowCommand: 'npm test' });
    expect(answer.allowedCommands).toEqual(['npm test', 'pnpm lint']);
    expect((await settings.read()).agent).toEqual({ allowedCommands: ['npm test', 'pnpm lint'] });
    expect(seen).toEqual([{ type: 'settings.changed' }, { type: 'settings.changed' }, { type: 'settings.changed' }]);
  });

  it('012 AC-15: takes one entry off the list and leaves the others, even one that is not there', async () => {
    const { preferences, settings } = service({ agent: { allowedCommands: ['npm test', 'pnpm lint'] } });
    expect((await preferences.change({ disallowCommand: 'npm test' })).allowedCommands).toEqual(['pnpm lint']);
    expect((await preferences.change({ disallowCommand: 'npm test' })).allowedCommands).toEqual(['pnpm lint']);
    expect((await settings.read()).agent).toEqual({ allowedCommands: ['pnpm lint'] });
  });

  it('012 AC-11: reads the list as written, keeping the mode beside it and dropping what is not a command', async () => {
    const { preferences } = service({
      agent: { permissionMode: 'edit_and_run_allowed', allowedCommands: ['npm test', '', 7] },
    });
    expect(await preferences.read()).toMatchObject({
      permissions: { commands: 'allowed_list' },
      allowedCommands: ['npm test'],
    });
    expect((await preferences.change({ allowCommand: 'pnpm lint' })).allowedCommands).toEqual([
      'npm test',
      'pnpm lint',
    ]);
    const { preferences: noList } = service({ agent: { allowedCommands: 'npm test' } });
    expect((await noList.read()).allowedCommands).toEqual([]);
  });

  it('013 AC-26: saves the editor beside the mode, and says settings changed', async () => {
    const { preferences, settings, seen } = service({ agent: { permissionMode: 'ask_everything' } });
    const answer = await preferences.change({ editor: 'cursor' });
    expect(answer).toMatchObject({ editor: 'cursor', permissions: { edits: 'ask' } });
    expect((await settings.read()).agent).toEqual({ permissionMode: 'ask_everything', editor: 'cursor' });
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it("013 AC-20: reads VS Code when settings.json has no editor, or one it doesn't know", async () => {
    expect((await service().preferences.read()).editor).toBe('vscode');
    expect((await service({ agent: { editor: 'zed' } }).preferences.read()).editor).toBe('vscode');
    expect((await service({ agent: { editor: 'cursor' } }).preferences.read()).editor).toBe('cursor');
  });

  it('044 Q8: Claude changes Jira is off until saved on, and is saved beside the rows', async () => {
    expect((await service().preferences.read()).jiraChanges).toBe(false);
    expect((await service({ agent: { jiraChanges: 'yes' } }).preferences.read()).jiraChanges).toBe(false);
    const { preferences, settings, seen } = service({ agent: { editor: 'cursor' } });

    expect(await preferences.change({ jiraChanges: true })).toMatchObject({ jiraChanges: true, editor: 'cursor' });
    expect((await settings.read()).agent).toEqual({ editor: 'cursor', jiraChanges: true });
    expect(seen).toEqual([{ type: 'settings.changed' }]);
  });

  it('AC-18: leaves the Jira and GitHub settings as they were', async () => {
    const { preferences, settings } = service({ jira, github: { method: 'gh' } });

    await preferences.change({ permissions: { commands: 'allowed_list' } });
    await preferences.change({ inboxRules: { jira_assigned: false } });

    expect(await settings.read()).toMatchObject({ jira, github: { method: 'gh' } });
  });

  it("treats a mode or rule it can't read as never chosen, and keeps it through this version's saves", async () => {
    const { preferences, settings } = service({
      agent: { permissionMode: 'yolo', model: 'newer' },
      inbox: { rules: { checks_failing: 'no', slack_no_reply: false } },
    });

    expect(await preferences.read()).toEqual(defaultPreferences);
    await preferences.change({ inboxRules: { review_requested: false } });

    expect(await settings.read()).toMatchObject({
      agent: { permissionMode: 'yolo', model: 'newer' },
      inbox: { rules: { checks_failing: 'no', slack_no_reply: false, review_requested: false } },
    });
  });

  it("keeps a rule a newer DevHub saved, without reporting it, so it survives this version's saves", async () => {
    const { preferences, settings } = service({ inbox: { rules: { slack_no_reply: false } } });

    expect(await preferences.read()).toEqual(defaultPreferences);
    await preferences.change({ inboxRules: { checks_failing: false } });

    expect((await settings.read()).inbox).toEqual({ rules: { slack_no_reply: false, checks_failing: false } });
  });
});
