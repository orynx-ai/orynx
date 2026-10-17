import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  defaultPreferences,
  InboxRuleIdSchema,
  PermissionModeSchema,
  PreferencesChangeSchema,
  PreferencesSchema,
  ServerEventSchema,
} from './index.ts';
import { makePreferences } from './testing.ts';

describe('PreferencesSchema', () => {
  it('AC-2: offers the three permission modes from the product spec, in its order', () => {
    expect(PermissionModeSchema.options).toEqual([
      'ask_everything',
      'edit_freely_ask_commands',
      'edit_and_run_allowed',
    ]);
  });

  it('AC-2, AC-12: starts at "Edit files freely, ask before commands" with every inbox rule on', () => {
    expect(defaultPreferences).toEqual({
      permissionMode: 'edit_freely_ask_commands',
      inboxRules: {
        jira_assigned: true,
        review_requested: true,
        checks_failing: true,
        unresolved_comments: true,
        session_waiting: true,
      },
    });
    expect(PreferencesSchema.parse(defaultPreferences)).toEqual(defaultPreferences);
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
    expect(makePreferences({ permissionMode: 'ask_everything' }).permissionMode).toBe('ask_everything');
    expect(makePreferences({ inboxRules: { checks_failing: false } }).inboxRules).toEqual({
      ...defaultPreferences.inboxRules,
      checks_failing: false,
    });
  });
});

describe('PreferencesChangeSchema', () => {
  it('AC-3, AC-13: takes the mode alone, or only the rules that changed', () => {
    expect(PreferencesChangeSchema.parse({ permissionMode: 'ask_everything' })).toEqual({
      permissionMode: 'ask_everything',
    });
    expect(PreferencesChangeSchema.parse({ inboxRules: { checks_failing: false } })).toEqual({
      inboxRules: { checks_failing: false },
    });
  });

  it('refuses an empty change, an unknown mode, an unknown rule and an unknown key', () => {
    for (const body of [
      {},
      { permissionMode: 'yolo' },
      { inboxRules: { slack_no_reply: false } },
      { inboxRules: { checks_failing: 'no' } },
      { theme: 'dark' },
    ]) {
      expect(PreferencesChangeSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('lives at /api/preferences', () => {
    expect(apiRoutes.preferences).toBe('/api/preferences');
  });
});

describe('the settings.changed event', () => {
  it('AC-17: is one the client knows, so another tab can refetch', () => {
    expect(ServerEventSchema.parse({ type: 'settings.changed' })).toEqual({ type: 'settings.changed' });
  });
});
