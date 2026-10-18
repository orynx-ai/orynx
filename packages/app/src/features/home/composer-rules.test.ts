import { describe, expect, it } from 'vitest';
import type { ComposerChip } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { addChip, chipFromPaste, fileChipFrom, folderFor } from './composer-rules.ts';

const bytes = (text: string) => new TextEncoder().encode(text);

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

describe('a file the composer takes (spec 015, Q5)', () => {
  it('AC-12: takes UTF-8 text of up to 100 KB, under its name', () => {
    expect(fileChipFrom('notes.md', bytes('# Notes\n\nExport every column.'))).toEqual({
      kind: 'file',
      name: 'notes.md',
      text: '# Notes\n\nExport every column.',
    });
    expect(fileChipFrom('full.log', bytes('x'.repeat(102_400)))).toMatchObject({ kind: 'file' });
  });

  it('AC-12: refuses a file over 100 KB, one that isn’t UTF-8, and one with a NUL byte', () => {
    expect(fileChipFrom('big.log', bytes('x'.repeat(102_401)))).toEqual({ kind: 'too_big', name: 'big.log' });
    expect(fileChipFrom('logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]))).toEqual({
      kind: 'not_text',
      name: 'logo.png',
    });
    expect(fileChipFrom('data.bin', bytes('a\u0000b'))).toEqual({ kind: 'not_text', name: 'data.bin' });
  });
});

describe('adding a chip (spec 015)', () => {
  const ticket = { kind: 'jira', key: 'PROJ-1423' } as const;
  const pull = (number: number) => ({ kind: 'pull_request', owner: 'acme', name: 'web-app', number }) as const;
  const file = (name: string) => ({ kind: 'file', name, text: name }) as const;

  it('AC-9 (Q2): a second ticket takes the first one’s place', () => {
    const chips: ComposerChip[] = [file('a.md'), ticket, pull(1)];
    expect(addChip(chips, { kind: 'jira', key: 'PROJ-7' })).toEqual({
      ok: true,
      chips: [file('a.md'), { kind: 'jira', key: 'PROJ-7' }, pull(1)],
    });
  });

  it('AC-11, AC-12: the same pull request or file twice changes nothing, and limits are said', () => {
    expect(addChip([pull(1)], pull(1))).toEqual({ ok: true, chips: [pull(1)] });
    expect(addChip([pull(1), pull(2), pull(3)], pull(4))).toEqual({ ok: false, refusal: 'too_many_pull_requests' });
    const five = ['1', '2', '3', '4', '5'].map((n) => file(`${n}.md`));
    expect(addChip(five, file('6.md'))).toEqual({ ok: false, refusal: 'too_many_files' });
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
