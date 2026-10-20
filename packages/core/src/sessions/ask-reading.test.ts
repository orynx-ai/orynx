import { describe, expect, it } from 'vitest';
import { defaultSteps, readingFrom, readingPrompt, type AskInput } from './ask-reading.ts';

const input: AskInput = {
  message: 'take a pull from latest develop and start the server on free port',
  chips: [],
  folder: 'acme-app',
  hints: {
    base: 'origin/develop',
    origin: ['develop', 'main', 'release/26.10.02'],
    yours: ['rakesh.dhariwal/mai-2161-connectors-prefetch'],
  },
  rules: 'From CONTRIBUTING.md:\n- Branch from **`develop`**: `git checkout -b <your-prefix>/<name> origin/develop`.',
  ticketKey: null,
  workOn: 'new_branch',
  fallbackBranch: 'feat/take-a-pull-from-latest',
};

const answer = (fields: Record<string, unknown>) =>
  JSON.stringify({
    intent: 'run',
    title: 'Pull develop and start the dev server',
    branch: 'rakesh.dhariwal/run-dev-server',
    branchFrom: 'repo_rules',
    base: 'develop',
    steps: [
      { kind: 'setup', label: 'Set up' },
      { kind: 'run', label: 'Start server' },
    ],
    ...fields,
  });

describe('the quick read (spec 042)', () => {
  it('AC-1: gives Claude the ask, the folder, the branches and the rules, and nothing else', () => {
    const prompt = readingPrompt(input);
    expect(prompt).toContain(input.message);
    expect(prompt).toContain('Folder: acme-app');
    expect(prompt).toContain('Default branch: develop');
    expect(prompt).toContain('develop, main, release/26.10.02');
    expect(prompt).toContain('rakesh.dhariwal/mai-2161-connectors-prefetch');
    expect(prompt).toContain('<your-prefix>/<name>');
    expect(readingPrompt({ ...input, rules: '', hints: null })).toContain(
      "The repository's rules for branch names: none written.",
    );
    expect(readingPrompt({ ...input, ticketKey: 'MAI-2161' })).toContain('The branch name must hold MAI-2161.');
  });

  it('AC-1: reads Claude’s answer, in a code fence or not, into the session’s intent, title, base, branch and steps', () => {
    const expected = {
      intent: 'run',
      title: 'Pull develop and start the dev server',
      base: 'origin/develop',
      missingBase: null,
      branch: 'rakesh.dhariwal/run-dev-server',
      branchFrom: 'repo_rules',
      suggested: null,
      branchNote: null,
      onOrigin: false,
      steps: [
        { kind: 'setup', label: 'Set up' },
        { kind: 'run', label: 'Start server' },
      ],
    };
    expect(readingFrom(answer({}), input)).toEqual(expected);
    expect(readingFrom(`Here it is:\n\`\`\`json\n${answer({})}\n\`\`\``, input)).toEqual(expected);
  });

  it('AC-23: a base that isn’t on origin starts from the default branch, and says so', () => {
    expect(readingFrom(answer({ base: 'release/26.10.03' }), input)).toMatchObject({
      base: 'origin/develop',
      missingBase: 'release/26.10.03',
    });
    expect(readingFrom(answer({ base: 'origin/main' }), input)).toMatchObject({
      base: 'origin/main',
      missingBase: null,
    });
    expect(readingFrom(answer({ base: null }), input)).toMatchObject({ base: 'origin/develop', missingBase: null });
    expect(readingFrom(answer({ base: 'develop' }), { ...input, hints: null })).toMatchObject({ base: null });
  });

  it('AC-21: a branch name git would refuse, too long, or without the ticket’s key is replaced by Orynx’s', () => {
    const unusable = (branch: string, more: Partial<AskInput> = {}) =>
      readingFrom(answer({ branch }), { ...input, ...more });
    for (const bad of [
      'fix login',
      'fix..login',
      'fix/login.lock',
      '-fix',
      'fix/',
      'fix~1',
      'a'.repeat(61),
      'fix/@{x}',
    ])
      expect(unusable(bad), bad).toMatchObject({
        branch: 'feat/take-a-pull-from-latest',
        branchFrom: 'orynx',
        suggested: bad,
        branchNote: 'unusable',
      });
    expect(unusable('fix/login', { ticketKey: 'MAI-2161' })).toMatchObject({ branchNote: 'unusable' });
    expect(unusable('feature/mai-2161-login', { ticketKey: 'MAI-2161' })).toMatchObject({ branchNote: null });
    expect(readingFrom(answer({ branch: null, branchFrom: null }), input)).toMatchObject({
      branch: 'feat/take-a-pull-from-latest',
      branchFrom: 'orynx',
      branchNote: null,
    });
  });

  it('AC-18: a branch you named that is on origin is where the worktree starts, and keeps its name', () => {
    const named = answer({ branch: 'release/26.10.02', branchFrom: 'message', base: null });
    expect(readingFrom(named, input)).toMatchObject({
      base: 'origin/release/26.10.02',
      branch: 'release/26.10.02',
      onOrigin: true,
    });
    expect(readingFrom(answer({}), input)).toMatchObject({ onOrigin: false });
  });

  it('AC-27: steps that break a rule give way to the intent’s own; a pull request’s words are Orynx’s', () => {
    const six = Array.from({ length: 6 }, (_, index) => ({ kind: 'build', label: `Step ${String(index)}` }));
    expect(readingFrom(answer({ steps: six }), input)?.steps).toEqual(defaultSteps('run', 'new_branch'));
    const change = answer({
      intent: 'change',
      steps: [
        { kind: 'build', label: 'Fix it' },
        { kind: 'pull_request', label: 'open the PR!' },
      ],
    });
    expect(readingFrom(change, input)?.steps.at(-1)).toEqual({ kind: 'pull_request', label: 'Pull request' });
    expect(readingFrom(change, { ...input, workOn: 'pull_request' })?.steps.at(-1)).toEqual({
      kind: 'pull_request',
      label: 'Push',
    });
  });

  it('AC-22: an answer that isn’t the JSON asked for is no reading at all', () => {
    for (const text of ['', 'I will start the server now.', '{"intent":"ship"}', answer({ intent: 'deploy' }), '{'])
      expect(readingFrom(text, input), text).toBeNull();
  });

  it('a title too long is cut on a word', () => {
    const title = readingFrom(answer({ title: `${'word '.repeat(30)}end` }), input)?.title ?? '';
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith('…')).toBe(true);
  });

  it('AC-22, AC-29: each intent’s own steps, and today’s five when the intent is unknown', () => {
    const labels = (
      intent: Parameters<typeof defaultSteps>[0],
      workOn: Parameters<typeof defaultSteps>[1] = 'new_branch',
    ) => defaultSteps(intent, workOn).map((step) => step.label);
    expect(labels('run')).toEqual(['Set up', 'Run']);
    expect(labels('answer')).toEqual(['Answer']);
    expect(labels('change')).toEqual(['Plan', 'Build', 'Test', 'Review', 'Pull request']);
    expect(labels(null, 'pull_request')).toEqual(['Plan', 'Build', 'Test', 'Review', 'Push']);
  });
});
