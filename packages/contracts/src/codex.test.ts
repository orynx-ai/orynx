import { describe, expect, it } from 'vitest';
import { AgentIdSchema, apiRoutes, CodexLoginSchema } from './index.ts';

describe('CodexLoginSchema (spec 052)', () => {
  it('AC-1: carries the ChatGPT account the card names', () => {
    const login = { state: 'signed_in', method: 'chatgpt', email: 'you@company.com' };
    expect(CodexLoginSchema.parse(login)).toEqual(login);
  });

  it('AC-1: an API key, or a way Orynx does not name, carries no account', () => {
    for (const method of ['api_key', 'other'] as const) {
      expect(CodexLoginSchema.parse({ state: 'signed_in', method, email: null })).toEqual({
        state: 'signed_in',
        method,
        email: null,
      });
    }
    expect(CodexLoginSchema.safeParse({ state: 'signed_in', method: 'oauth', email: null }).success).toBe(false);
    expect(CodexLoginSchema.safeParse({ state: 'signed_in', method: 'chatgpt', email: '' }).success).toBe(false);
  });

  it('AC-2: signed out, not installed and error carry nothing else', () => {
    for (const state of ['signed_out', 'not_installed', 'error'] as const) {
      expect(CodexLoginSchema.parse({ state, email: 'you@company.com', version: '0.100.0' })).toEqual({ state });
    }
  });

  it('AC-1: has a path to read the login and one to check it again', () => {
    expect(apiRoutes.codexLogin).toBe('/api/codex/login');
    expect(apiRoutes.codexLoginCheck).toBe('/api/codex/login/check');
  });
});

describe('AgentIdSchema (spec 052)', () => {
  it('names Claude and Codex, Claude first', () => {
    expect(AgentIdSchema.options).toEqual(['claude', 'codex']);
  });
});
