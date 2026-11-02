import { describe, expect, it } from 'vitest';
import { apiRoutes, slackScopes, SlackConnectionRequestSchema, SlackConnectionSchema } from './index.ts';
import { makeSlackConnection } from './testing.ts';

describe('SlackConnectionRequestSchema (spec 016)', () => {
  it('AC-2: trims the pasted token, because a pasted value often carries a space', () => {
    expect(SlackConnectionRequestSchema.parse({ token: ' fake-slack-token\n' })).toEqual({ token: 'fake-slack-token' });
  });

  it('AC-2: refuses a token with a space inside, in spec 002 words', () => {
    const result = SlackConnectionRequestSchema.safeParse({ token: 'fake slack' });
    expect(result.error?.issues[0]?.message).toBe('Paste the token without spaces or line breaks.');
  });

  it('lets the token be left out or empty, to keep the saved one or use .env', () => {
    expect(SlackConnectionRequestSchema.parse({})).toEqual({});
    expect(SlackConnectionRequestSchema.parse({ token: '  ' })).toEqual({});
  });
});

describe('SlackConnectionSchema (spec 016)', () => {
  it('AC-2: names the workspace and the person, and never a token', () => {
    const connection = makeSlackConnection();
    expect(SlackConnectionSchema.parse(connection)).toEqual(connection);
    expect(Object.keys(connection.saved ?? {})).not.toContain('token');
  });

  it("refuses a workspace address that isn't Slack's own https", () => {
    const saved = { ...makeSlackConnection().saved, url: 'https://acme.example.com/' };
    expect(SlackConnectionSchema.safeParse({ saved, envToken: false }).success).toBe(false);
  });
});

describe('slackScopes (spec 016, A and Q3)', () => {
  it('AC-1, AC-3: are what the admin is asked for and what a token is checked against', () => {
    expect(slackScopes).toEqual([
      'search:read',
      'im:history',
      'im:read',
      'mpim:history',
      'mpim:read',
      'channels:history',
      'channels:read',
      'groups:history',
      'groups:read',
      'users:read',
      'chat:write',
    ]);
  });
});

describe('Slack routes', () => {
  it('serves the connection beside Jira and GitHub', () => {
    expect(apiRoutes.slackConnection).toBe('/api/slack/connection');
    expect(apiRoutes.slackConnectionCheck).toBe('/api/slack/connection/check');
  });
});
