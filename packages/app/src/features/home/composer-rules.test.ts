import { describe, expect, it } from 'vitest';
import type { ComposerChip } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { addChip, chipFromPaste, fileChipFor, folderFor } from './composer-rules.ts';

describe('a paste that becomes a chip (spec 015, Q6)', () => {
  it.each([
    ['PROJ-1423', { kind: 'jira', key: 'PROJ-1423' }],
    ['  PROJ-1423\n', { kind: 'jira', key: 'PROJ-1423' }],
    [
      'https://github.com/acme/web-app/pull/2836',
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
    ],
    [
      'https://github.com/acme/web-app/pull/2836/files',
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
    ],
    [
      'https://github.com/acme/web.app/pull/7#discussion_r1',
      { kind: 'pull_request', owner: 'acme', name: 'web.app', number: 7 },
    ],
    [
      'https://www.github.com/acme/web-app/pull/2836/',
      { kind: 'pull_request', owner: 'acme', name: 'web-app', number: 2836 },
    ],
  ])('AC-14: %j becomes its chip', (text, chip) => {
    expect(chipFromPaste(text)).toEqual(chip);
  });

  it.each([
    'Fix PROJ-1423 please',
    'proj-1423',
    'PROJ-0',
    'https://github.com/acme/web-app/issues/2836',
    'https://gitlab.com/acme/web-app/pull/2836',
    'http://github.com/acme/web-app/pull/2836',
    'https://github.com/acme/web-app/pull/2836 and more',
    'https://github.com/../web-app/pull/2836',
    '',
  ])('AC-14: %j stays text', (text) => {
    expect(chipFromPaste(text)).toBeNull();
  });
});

describe('a file the composer takes (spec 022, Q4)', () => {
  it('AC-10: takes any file by its path', () => {
    for (const path of ['~/Movies/demo.mov', '/Users/dev/notes/plan.pdf', '~/.env.example']) {
      expect(fileChipFor(path)).toEqual({ kind: 'file', path });
    }
  });

  it('AC-13: refuses a file whose name looks like a secret, naming it', () => {
    expect(fileChipFor('~/.ssh/id_rsa')).toEqual({ kind: 'secret', name: 'id_rsa' });
    expect(fileChipFor('/Users/dev/web-app/.env.local')).toEqual({ kind: 'secret', name: '.env.local' });
  });
});

describe('adding a chip (spec 015)', () => {
  const ticket = { kind: 'jira', key: 'PROJ-1423' } as const;
  const pull = (number: number) => ({ kind: 'pull_request', owner: 'acme', name: 'web-app', number }) as const;
  const file = (name: string) => ({ kind: 'file', path: `~/${name}` }) as const;

  it('022 AC-1 (Q2): a second ticket is added after the first; the same one twice changes nothing', () => {
    const chips: ComposerChip[] = [file('a.md'), ticket, pull(1)];
    expect(addChip(chips, { kind: 'jira', key: 'PROJ-7' })).toEqual({
      ok: true,
      chips: [file('a.md'), ticket, pull(1), { kind: 'jira', key: 'PROJ-7' }],
    });
    expect(addChip(chips, ticket)).toEqual({ ok: true, chips });
  });

  it('022 AC-3 (Q5): up to 100 tickets, 100 pull requests and 100 files, and each limit is said', () => {
    const upTo = (count: number) => Array.from({ length: count }, (_, n) => n + 1);
    const tickets = upTo(100).map((n): ComposerChip => ({ kind: 'jira', key: `PROJ-${String(n)}` }));
    expect(addChip(tickets, { kind: 'jira', key: 'PROJ-101' })).toEqual({ ok: false, refusal: 'too_many_tickets' });
    expect(addChip(upTo(99).map(pull), pull(100)).ok).toBe(true);
    expect(addChip(upTo(100).map(pull), pull(101))).toEqual({ ok: false, refusal: 'too_many_pull_requests' });
    const files = upTo(100).map((n) => file(`${String(n)}.md`));
    expect(addChip(files, file('101.md'))).toEqual({ ok: false, refusal: 'too_many_files' });
    expect(addChip([pull(1)], pull(1))).toEqual({ ok: true, chips: [pull(1)] });
    expect(addChip([file('a.md')], file('a.md'))).toEqual({ ok: true, chips: [file('a.md')] });
    expect(addChip([], ticket)).toEqual({ ok: true, chips: [ticket] });
  });
});

describe('which folder the composer shows (spec 015, Q7)', () => {
  const web = makeRepository({ id: '00000000000000aa', name: 'web-app', jiraProject: 'PROJ' });
  const web2 = makeRepository({ id: '00000000000000cc', name: 'web-app-2', jiraProject: 'PROJ' });
  const api = makeRepository({ id: '00000000000000bb', name: 'api', jiraProject: null });

  it.each([
    [
      'the one you picked',
      { folders: [web, api], picked: api.id, ticketKey: 'PROJ-1', lastUsed: null },
      { kind: 'folder', folder: api },
    ],
    [
      'the ticket project’s folder',
      { folders: [web, api], picked: null, ticketKey: 'PROJ-1', lastUsed: api.id },
      { kind: 'folder', folder: web },
    ],
    [
      'the last used, with no folder for the ticket',
      { folders: [web, api], picked: null, ticketKey: 'OPS-1', lastUsed: api.id },
      { kind: 'folder', folder: api },
    ],
    [
      'the last used, with no ticket',
      { folders: [web, api], picked: null, ticketKey: null, lastUsed: web.id },
      { kind: 'folder', folder: web },
    ],
    [
      'the only one',
      { folders: [api], picked: null, ticketKey: null, lastUsed: null },
      { kind: 'folder', folder: api },
    ],
    [
      'a choice, for a project with two folders',
      { folders: [web, web2, api], picked: null, ticketKey: 'PROJ-1', lastUsed: api.id },
      { kind: 'choose' },
    ],
    [
      'a choice, with two folders and nothing to go on',
      { folders: [web, api], picked: null, ticketKey: null, lastUsed: '00000000000000ff' },
      { kind: 'choose' },
    ],
    ['none, with no folders', { folders: [], picked: api.id, ticketKey: 'PROJ-1', lastUsed: api.id }, { kind: 'none' }],
  ] as const)('AC-17, AC-18: shows %s', (_case, input, shown) => {
    expect(folderFor(input)).toEqual(shown);
  });
});
