import { describe, expect, it } from 'vitest';
import { makePullRequestDraft, makePushDraft } from '@devhub/contracts/testing';
import {
  cannotOpenWords,
  cannotPushWords,
  discardKeepsPullRequest,
  failureLine,
  openPullRequestLabel,
  pullRequestWords,
  pushHappensLine,
  whatHappensLine,
  whereLine,
} from './pull-request-words.ts';

const number = 2841;
const pr = `#${String(number)}`;
const where = { repository: 'acme/web-app', branch: 'feat/PROJ-1423', base: 'main' };

describe('the dialog’s words (spec 014, Q11a, Q11b)', () => {
  it('Q11a: names the buttons as drawn and as answered', () => {
    expect(pullRequestWords).toMatchObject({
      create: 'Create pull request',
      creating: 'Creating…',
      cancel: 'Cancel',
      push: 'Push changes',
      pushing: 'Pushing…',
    });
    expect(openPullRequestLabel(number)).toBe(`Open PR ${pr}`);
  });

  it('Q11b: labels the fields, says Claude is drafting, and when it couldn’t', () => {
    expect(pullRequestWords).toMatchObject({
      title: 'Title',
      description: 'Description',
      descriptionHelp: 'Markdown, as on GitHub.',
      drafting: 'Claude is drafting the title and description…',
      notDrafted: "Claude couldn't draft this, so it starts from the ticket and Claude's summary.",
    });
  });

  it('AC-2: says where the pull request goes, and what will happen, by how many files Orynx commits', () => {
    expect(whereLine(makePullRequestDraft())).toBe('acme/web-app · feat/PROJ-1423 → main');
    expect(whatHappensLine(makePullRequestDraft({ files: 4 }))).toBe(
      'Orynx commits 4 changed files, pushes feat/PROJ-1423 to acme/web-app and opens the pull request.',
    );
    expect(whatHappensLine(makePullRequestDraft({ files: 1 }))).toBe(
      'Orynx commits 1 changed file, pushes feat/PROJ-1423 to acme/web-app and opens the pull request.',
    );
    expect(whatHappensLine(makePullRequestDraft({ files: 0 }))).toBe(
      'Orynx pushes feat/PROJ-1423 to acme/web-app and opens the pull request.',
    );
  });
});

describe('why there can’t be a pull request (spec 014, Q11c)', () => {
  it.each([
    ['no_origin', 'This folder has no origin to push to.'],
    ['not_github', "This folder's origin isn't on github.com, so Orynx can't open a pull request there."],
    ['no_changes', "There's nothing to put in a pull request: the worktree has no changes."],
    ['missing', 'The worktree is missing. It was moved or deleted outside Orynx.'],
  ] as const)('AC-7: %s', (reason, line) => {
    expect(cannotOpenWords(reason)).toEqual({ line, settings: false });
  });

  it('says when Orynx’s server didn’t answer the draft or the press, with Try again', () => {
    expect(pullRequestWords).toMatchObject({
      draftFailed: "Couldn't get a draft.",
      tryAgain: 'Try again',
      createFailed: "Couldn't create the pull request. Try again.",
    });
  });

  it('AC-7: asks you to connect GitHub, with Settings linked', () => {
    expect(cannotOpenWords('not_connected')).toEqual({ line: 'Connect GitHub to open pull requests.', settings: true });
    expect(pullRequestWords.openSettings).toBe('Open Settings');
  });

  it('says the states the button never opens the dialog in, should the server see one first', () => {
    for (const reason of ['no_worktree', 'working', 'discarded', 'opened'] as const) {
      expect(cannotOpenWords(reason).line).not.toBe('');
    }
  });
});

describe('when it fails (spec 014, Q11d)', () => {
  it.each([
    [{ kind: 'no_identity' }, 'git has no name and email for you. Set them with git config, then try again.'],
    [{ kind: 'signing' }, "git couldn't sign the commit."],
    [{ kind: 'commit_failed' }, "Couldn't commit the changes. Try again."],
    [
      { kind: 'secret', path: '.env.local' },
      "Couldn't commit .env.local: it looks like a secret. Delete it or add it to .gitignore, then try again.",
    ],
    [
      { kind: 'push_auth' },
      "git couldn't sign in to acme/web-app. Check that git push works for this folder in a terminal.",
    ],
    [
      { kind: 'push_rejected' },
      "acme/web-app already has feat/PROJ-1423 with commits this worktree doesn't have. Orynx never overwrites them.",
    ],
    [{ kind: 'push_failed' }, "Couldn't push to acme/web-app. Try again."],
    [{ kind: 'github_forbidden' }, "Your GitHub account can't open pull requests in acme/web-app."],
    [
      { kind: 'github_sso', url: 'https://github.com/orgs/acme/sso?authorization_request=A1' },
      "Authorize your GitHub token for acme's single sign-on, then try again.",
    ],
    [{ kind: 'rate_limited', resetAt: null }, "GitHub's rate limit is used up."],
    [
      { kind: 'github_unreachable' },
      "Couldn't reach GitHub. The branch is pushed, so try again to open the pull request.",
    ],
    [{ kind: 'no_commits' }, "GitHub says there's nothing to merge from feat/PROJ-1423 into main."],
    [{ kind: 'github_refused' }, 'GitHub refused the pull request. Try again.'],
  ] as const)('AC-8 to AC-10: %o', (problem, line) => {
    expect(failureLine(problem, where)).toBe(line);
  });

  it("AC-10: says until when GitHub's rate limit is used up, on the laptop's clock", () => {
    const at = new Date(2026, 9, 18, 14, 5);
    expect(failureLine({ kind: 'rate_limited', resetAt: at.toISOString() }, where)).toBe(
      "GitHub's rate limit is used up until 14:05.",
    );
  });
});

describe('Push changes (spec 014, Q11f)', () => {
  it('AC-17: says what will happen, and when there’s nothing new', () => {
    expect(pullRequestWords.commitMessage).toBe('Commit message');
    expect(pushHappensLine(makePushDraft({ files: 2 }))).toBe(
      `Orynx commits 2 changed files and pushes them to feat/PROJ-1423, which updates pull request ${pr}.`,
    );
    expect(pushHappensLine(makePushDraft({ files: 0 }))).toBe(
      `Orynx pushes feat/PROJ-1423, which updates pull request ${pr}.`,
    );
    expect(pullRequestWords.nothingNew).toBe('Nothing new to push: GitHub already has everything in the worktree.');
    expect(pullRequestWords.draftingMessage).toBe('Claude is drafting the commit message…');
    expect(pullRequestWords.pushFailed).toBe("Couldn't push the changes. Try again.");
  });

  it('AC-17: says why it can’t push', () => {
    expect(cannotPushWords('missing')).toBe('The worktree is missing. It was moved or deleted outside Orynx.');
    for (const reason of ['no_pull_request', 'no_origin', 'not_github', 'working', 'discarded'] as const) {
      expect(cannotPushWords(reason)).not.toBe('');
    }
  });
});

describe('Discard once a pull request is open (spec 014, Q11g)', () => {
  it('AC-18: says the pull request and the branch on GitHub stay', () => {
    expect(discardKeepsPullRequest(number)).toBe(`Pull request ${pr} and the branch on GitHub stay.`);
  });
});
