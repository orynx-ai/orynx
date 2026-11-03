import { describe, expect, it } from 'vitest';
import { apiRoutes, ApiErrorCodeSchema, DiscordConnectionRequestSchema, DiscordConnectionSchema } from './index.ts';
import { makeDiscordConnection } from './testing.ts';

const userId = '80351110224678912';

describe('DiscordConnectionRequestSchema (spec 016)', () => {
  it("AC-6: trims the pasted bot token, and needs no user ID when you own the bot's application", () => {
    expect(DiscordConnectionRequestSchema.parse({ token: ' fake-discord-token ' })).toEqual({
      token: 'fake-discord-token',
    });
  });

  it('AC-8: takes your Discord user ID, 17 to 20 digits, when a team owns the application', () => {
    expect(DiscordConnectionRequestSchema.parse({ token: 'fake-discord-token', userId: ` ${userId} ` })).toEqual({
      token: 'fake-discord-token',
      userId,
    });
    const result = DiscordConnectionRequestSchema.safeParse({ token: 'fake-discord-token', userId: '@neha' });
    expect(result.error?.issues[0]?.message).toBe('Paste your Discord user ID: 17 to 20 digits.');
  });

  it('lets the token be left out or empty, to keep the saved one or use .env', () => {
    expect(DiscordConnectionRequestSchema.parse({ token: '' })).toEqual({});
  });
});

describe('DiscordConnectionSchema (spec 016)', () => {
  it('AC-6: names the bot and whose mentions it reads, and never a token', () => {
    const connection = makeDiscordConnection();
    expect(DiscordConnectionSchema.parse(connection)).toEqual(connection);
    expect(Object.keys(connection.saved ?? {})).not.toContain('token');
  });
});

describe('Discord errors and routes', () => {
  it('AC-8: has a code that tells the form to ask for your user ID', () => {
    expect(ApiErrorCodeSchema.parse('user_id_needed')).toBe('user_id_needed');
  });

  it('serves the connection beside the other tools', () => {
    expect(apiRoutes.discordConnection).toBe('/api/discord/connection');
    expect(apiRoutes.discordConnectionCheck).toBe('/api/discord/connection/check');
  });
});
