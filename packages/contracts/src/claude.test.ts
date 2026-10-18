import { describe, expect, it } from 'vitest';
import { apiRoutes, ClaudeLoginSchema } from './index.ts';
import { makeClaudeSignedIn } from './testing.ts';

describe('ClaudeLoginSchema', () => {
  it('AC-2: carries the claude.ai account the card names', () => {
    expect(ClaudeLoginSchema.parse(makeClaudeSignedIn())).toEqual({
      state: 'signed_in',
      method: 'claude_ai',
      email: 'you@company.com',
      organisation: 'Company',
    });
  });

  it('AC-3: carries the other ways Claude Code signs in, with no account', () => {
    for (const method of ['api_key', 'bedrock', 'vertex', 'other'] as const) {
      const login = makeClaudeSignedIn({ method, email: null, organisation: null });
      expect(ClaudeLoginSchema.parse(login)).toEqual({ state: 'signed_in', method, email: null, organisation: null });
    }
  });

  it('AC-3: rejects a way of signing in it does not name', () => {
    expect(ClaudeLoginSchema.safeParse({ ...makeClaudeSignedIn(), method: 'oauth' }).success).toBe(false);
  });

  it('AC-4, AC-6: signed out and error carry nothing else, so no reason or exit code reaches the page', () => {
    expect(ClaudeLoginSchema.parse({ state: 'signed_out', email: 'you@company.com' })).toEqual({ state: 'signed_out' });
    expect(ClaudeLoginSchema.parse({ state: 'error', exitCode: 1, output: 'oops' })).toEqual({ state: 'error' });
  });

  it('rejects an empty email or organisation, which the card would show as a blank', () => {
    expect(ClaudeLoginSchema.safeParse({ ...makeClaudeSignedIn(), email: '' }).success).toBe(false);
    expect(ClaudeLoginSchema.safeParse({ ...makeClaudeSignedIn(), organisation: '' }).success).toBe(false);
  });

  it('AC-5: has a path to read the login and one to check it again', () => {
    expect(apiRoutes.claudeLogin).toBe('/api/claude/login');
    expect(apiRoutes.claudeLoginCheck).toBe('/api/claude/login/check');
  });
});
