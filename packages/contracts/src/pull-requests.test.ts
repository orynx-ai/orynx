import { describe, expect, it } from 'vitest';
import {
  apiRoutes,
  CreatePullRequestAnswerSchema,
  CreatePullRequestRequestSchema,
  mostPullRequestBodyCharacters,
  mostPullRequestTitleCharacters,
  PullRequestDraftAnswerSchema,
  PushAnswerSchema,
  PushDraftAnswerSchema,
  PushRequestSchema,
} from './index.ts';
import { makePullRequestDraft, makePushDraft } from './testing.ts';

describe('the draft (spec 014)', () => {
  it('AC-2: carries the title, the description and what will happen', () => {
    const draft = makePullRequestDraft();
    expect(PullRequestDraftAnswerSchema.parse(draft)).toEqual({
      result: 'draft',
      title: 'PROJ-1423: Add bulk archive to the content list',
      body: expect.any(String) as string,
      byClaude: true,
      files: 4,
      branch: 'feat/PROJ-1423',
      repository: 'acme/web-app',
      base: 'main',
    });
  });

  it("AC-6: says when Claude couldn't draft it, so it starts from the ticket", () => {
    expect(PullRequestDraftAnswerSchema.parse(makePullRequestDraft({ byClaude: false }))).toMatchObject({
      byClaude: false,
    });
  });

  it("AC-7: says why there can't be a pull request", () => {
    for (const reason of [
      'not_connected',
      'no_origin',
      'not_github',
      'no_changes',
      'missing',
      'no_worktree',
      'working',
      'discarded',
      'opened',
    ] as const) {
      expect(PullRequestDraftAnswerSchema.parse({ result: 'cannot', reason })).toEqual({ result: 'cannot', reason });
    }
    expect(PullRequestDraftAnswerSchema.safeParse({ result: 'cannot', reason: 'tired' }).success).toBe(false);
  });

  it('names the repository as owner/name', () => {
    const draft = { ...makePullRequestDraft(), repository: 'web-app' };
    expect(PullRequestDraftAnswerSchema.safeParse(draft).success).toBe(false);
  });
});

describe('creating the pull request (spec 014)', () => {
  it('AC-4: takes the title, trimmed, and the description', () => {
    expect(
      CreatePullRequestRequestSchema.parse({ title: '  PROJ-1423: Add bulk archive  ', body: 'What changed' }),
    ).toEqual({ title: 'PROJ-1423: Add bulk archive', body: 'What changed' });
    expect(CreatePullRequestRequestSchema.parse({ title: 'PROJ-1423: Add bulk archive', body: '' }).body).toBe('');
  });

  it('Q11d: refuses an empty title, one longer than 256 characters, and a description longer than 65,536', () => {
    expect(mostPullRequestTitleCharacters).toBe(256);
    expect(mostPullRequestBodyCharacters).toBe(65_536);
    const ok = { title: 'T', body: '' };
    expect(CreatePullRequestRequestSchema.safeParse({ ...ok, title: '   ' }).success).toBe(false);
    expect(CreatePullRequestRequestSchema.safeParse({ ...ok, title: 'x'.repeat(256) }).success).toBe(true);
    expect(CreatePullRequestRequestSchema.safeParse({ ...ok, title: 'x'.repeat(257) }).success).toBe(false);
    expect(CreatePullRequestRequestSchema.safeParse({ ...ok, body: 'x'.repeat(65_536) }).success).toBe(true);
    expect(CreatePullRequestRequestSchema.safeParse({ ...ok, body: 'x'.repeat(65_537) }).success).toBe(false);
  });

  it('AC-4, AC-11: answers with the pull request opened, or the one it linked', () => {
    const opened = { result: 'opened', number: 2841, url: 'https://github.com/acme/web-app/pull/2841', linked: false };
    expect(CreatePullRequestAnswerSchema.parse(opened)).toEqual(opened);
    expect(CreatePullRequestAnswerSchema.parse({ ...opened, linked: true })).toMatchObject({ linked: true });
    const elsewhere = { ...opened, url: 'https://example.com/acme/web-app/pull/2841' };
    expect(CreatePullRequestAnswerSchema.safeParse(elsewhere).success).toBe(false);
  });

  it("AC-7: answers why there can't be one, as the draft does", () => {
    expect(CreatePullRequestAnswerSchema.parse({ result: 'cannot', reason: 'not_github' })).toEqual({
      result: 'cannot',
      reason: 'not_github',
    });
  });

  it('AC-8 to AC-10: answers each failure, with the file, the sign-on link or the reset time it needs', () => {
    const failures = [
      { kind: 'no_identity' },
      { kind: 'signing' },
      { kind: 'commit_failed' },
      { kind: 'secret', path: '.env.local' },
      { kind: 'push_auth' },
      { kind: 'push_rejected' },
      { kind: 'push_failed' },
      { kind: 'github_forbidden' },
      { kind: 'github_sso', url: 'https://github.com/orgs/acme/sso?authorization_request=A1B2' },
      { kind: 'rate_limited', resetAt: '2026-10-16T14:05:00.000Z' },
      { kind: 'rate_limited', resetAt: null },
      { kind: 'github_unreachable' },
      { kind: 'no_commits' },
      { kind: 'github_refused' },
    ] as const;
    for (const problem of failures) {
      expect(CreatePullRequestAnswerSchema.parse({ result: 'failed', problem })).toEqual({ result: 'failed', problem });
    }
    for (const problem of [
      { kind: 'secret' },
      { kind: 'github_sso', url: 'https://evil.example/sso' },
      { kind: 'rate_limited' },
    ]) {
      expect(CreatePullRequestAnswerSchema.safeParse({ result: 'failed', problem }).success, problem.kind).toBe(false);
    }
  });

  it('has its paths under the session', () => {
    expect(apiRoutes.sessionPullRequestDraft).toBe('/api/sessions/:id/pull-request/draft');
    expect(apiRoutes.sessionPullRequest).toBe('/api/sessions/:id/pull-request');
  });
});

describe('pushing changes to the pull request (spec 014, Q7)', () => {
  it("AC-17: drafts a commit message with what will happen, or says there's nothing new", () => {
    const draft = makePushDraft();
    expect(PushDraftAnswerSchema.parse(draft)).toEqual({
      result: 'draft',
      message: 'Use the existing useSelection hook in the content list',
      byClaude: true,
      files: 2,
      branch: 'feat/PROJ-1423',
      number: 2841,
    });
    expect(PushDraftAnswerSchema.parse({ result: 'nothing_new' })).toEqual({ result: 'nothing_new' });
  });

  it("AC-17: says why it can't push", () => {
    for (const reason of ['no_pull_request', 'no_origin', 'not_github', 'missing', 'working', 'discarded'] as const) {
      expect(PushDraftAnswerSchema.parse({ result: 'cannot', reason })).toEqual({ result: 'cannot', reason });
    }
  });

  it('AC-17: takes the commit message, trimmed, from 1 to 256 characters', () => {
    expect(PushRequestSchema.parse({ message: '  Use the existing hook ' })).toEqual({
      message: 'Use the existing hook',
    });
    expect(PushRequestSchema.safeParse({ message: ' ' }).success).toBe(false);
    expect(PushRequestSchema.safeParse({ message: 'x'.repeat(257) }).success).toBe(false);
  });

  it('AC-17: answers pushed with the files committed, nothing new, cannot, or a git problem', () => {
    for (const answer of [
      { result: 'pushed', files: 2 },
      { result: 'nothing_new' },
      { result: 'cannot', reason: 'no_pull_request' },
      { result: 'failed', problem: { kind: 'push_rejected' } },
      { result: 'failed', problem: { kind: 'secret', path: 'config/id_rsa' } },
    ] as const) {
      expect(PushAnswerSchema.parse(answer)).toEqual(answer);
    }
    // Push changes never asks GitHub, so it has no GitHub problem.
    expect(PushAnswerSchema.safeParse({ result: 'failed', problem: { kind: 'github_forbidden' } }).success).toBe(false);
  });

  it('has its paths under the session', () => {
    expect(apiRoutes.sessionPushDraft).toBe('/api/sessions/:id/push/draft');
    expect(apiRoutes.sessionPush).toBe('/api/sessions/:id/push');
  });
});
