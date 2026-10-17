import { describe, expect, it } from 'vitest';
import { apiRoutes, GitHubConnectionRequestSchema, GitHubConnectionSchema, GitHubTokenSchema } from './index.ts';
import { makeGitHubConnection } from './testing.ts';

/** The first message zod gives for a value, the one a form shows under the field. */
function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }): string | undefined {
  return result.error?.issues[0]?.message;
}

describe('GitHubConnectionRequestSchema', () => {
  it('AC-3: the gh way carries no token at all', () => {
    expect(GitHubConnectionRequestSchema.parse({ method: 'gh' })).toEqual({ method: 'gh' });
    // A stray token is dropped, so it can't travel on to the keychain or a log.
    expect(GitHubConnectionRequestSchema.parse({ method: 'gh', token: 'fake-token-abc' })).toEqual({ method: 'gh' });
  });

  it('AC-5: the token way trims the pasted token, because a pasted value often carries a space', () => {
    expect(GitHubConnectionRequestSchema.parse({ method: 'token', token: ' fake-token-abc\n' })).toEqual({
      method: 'token',
      token: 'fake-token-abc',
    });
  });

  it('AC-9: refuses a token with a space or line break inside', () => {
    for (const token of ['fake FfGF0', 'fake\nFfGF0']) {
      expect(firstMessage(GitHubConnectionRequestSchema.safeParse({ method: 'token', token }))).toBe(
        'Paste the token without spaces or line breaks.',
      );
    }
  });

  it('AC-9: refuses a token longer than 4096 characters with the message from spec 002', () => {
    expect(firstMessage(GitHubConnectionRequestSchema.safeParse({ method: 'token', token: 'a'.repeat(4097) }))).toBe(
      'A token has no spaces or line breaks and is at most 4096 characters.',
    );
  });

  it('AC-12, AC-14: lets the token be left out or left empty, to keep the saved one or use .env', () => {
    expect(GitHubConnectionRequestSchema.parse({ method: 'token' })).toEqual({ method: 'token' });
    expect(GitHubConnectionRequestSchema.parse({ method: 'token', token: '  ' })).toEqual({ method: 'token' });
  });

  it('refuses a way of connecting it does not know', () => {
    expect(GitHubConnectionRequestSchema.safeParse({ method: 'oauth' }).success).toBe(false);
    expect(GitHubConnectionRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('GitHubTokenSchema', () => {
  it('AC-9: asks for a token when the field is empty', () => {
    expect(firstMessage(GitHubTokenSchema.safeParse('   '))).toBe('Paste your GitHub token.');
  });
});

describe('GitHubConnectionSchema', () => {
  it('describes the saved way, whether .env holds a token and whether gh was found, never a token', () => {
    const body = { saved: { method: 'gh' }, envToken: true, ghFound: true };
    expect(GitHubConnectionSchema.parse(body)).toEqual(body);
    expect(Object.keys(GitHubConnectionSchema.shape)).toEqual(['saved', 'envToken', 'ghFound']);
  });

  it('builds a valid connection for tests', () => {
    expect(makeGitHubConnection()).toEqual({ saved: null, envToken: false, ghFound: false });
    expect(makeGitHubConnection({ saved: { method: 'token' } }).saved).toEqual({ method: 'token' });
  });

  it('lives at /api/github/connection', () => {
    expect(apiRoutes.githubConnection).toBe('/api/github/connection');
  });
});
