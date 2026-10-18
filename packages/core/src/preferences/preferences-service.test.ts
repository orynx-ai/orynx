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

  it('AC-3: saves a new permission mode and says settings changed', async () => {
    const { preferences, settings, seen } = service();

    const answer = await preferences.change({ permissionMode: 'ask_everything' });

    expect(answer.permissionMode).toBe('ask_everything');
    expect((await settings.read()).agent).toEqual({ permissionMode: 'ask_everything' });
    expect(await preferences.read()).toEqual(answer);
    expect(seen).toEqual([{ type: 'settings.changed' }]);
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
      permissionMode: 'edit_and_run_allowed',
      allowedCommands: ['npm test'],
    });
    expect((await preferences.change({ allowCommand: 'pnpm lint' })).allowedCommands).toEqual([
      'npm test',
      'pnpm lint',
    ]);
    const { preferences: noList } = service({ agent: { allowedCommands: 'npm test' } });
    expect((await noList.read()).allowedCommands).toEqual([]);
  });

  it('AC-18: leaves the Jira and GitHub settings as they were', async () => {
    const { preferences, settings } = service({ jira, github: { method: 'gh' } });

    await preferences.change({ permissionMode: 'edit_and_run_allowed' });
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
