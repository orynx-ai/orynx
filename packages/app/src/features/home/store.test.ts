import { beforeEach, describe, expect, it } from 'vitest';
import { initialComposer, useComposerStore } from './store.ts';

beforeEach(() => {
  localStorage.clear();
  useComposerStore.setState(initialComposer);
});

describe('the composer’s draft (spec 015, Q14)', () => {
  it('AC-33: holds the text, the chips in the order added and the folder you picked, while the page is open', () => {
    const composer = useComposerStore.getState();
    composer.setText('Use the notes');
    expect(composer.addChip({ kind: 'file', path: '~/notes.md' })).toBeNull();
    expect(composer.addChip({ kind: 'jira', key: 'PROJ-1423' })).toBeNull();
    composer.pickFolder('00000000000000bb');

    expect(useComposerStore.getState()).toMatchObject({
      text: 'Use the notes',
      chips: [
        { kind: 'file', path: '~/notes.md' },
        { kind: 'jira', key: 'PROJ-1423' },
      ],
      picked: '00000000000000bb',
    });
  });

  it('022 AC-1, AC-3: a second ticket is added after the first; a 101st pull request is refused', () => {
    const composer = useComposerStore.getState();
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.addChip({ kind: 'jira', key: 'PROJ-7' });
    expect(useComposerStore.getState().chips).toEqual([
      { kind: 'jira', key: 'PROJ-1423' },
      { kind: 'jira', key: 'PROJ-7' },
    ]);

    for (let number = 1; number <= 100; number++) {
      composer.addChip({ kind: 'pull_request', owner: 'acme', name: 'web-app', number });
    }
    expect(composer.addChip({ kind: 'pull_request', owner: 'acme', name: 'web-app', number: 101 })).toBe(
      'too_many_pull_requests',
    );
    expect(useComposerStore.getState().chips).toHaveLength(102);
  });

  it('AC-15: removes one chip by its place', () => {
    const composer = useComposerStore.getState();
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.addChip({ kind: 'file', path: '~/notes.md' });
    composer.removeChip(0);
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'file', path: '~/notes.md' }]);
  });

  it('AC-4: a sent draft is cleared and its folder remembered; only that folder and the agent pick are kept on this computer', () => {
    const composer = useComposerStore.getState();
    composer.setText('Add a CSV export');
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.pickFolder('00000000000000bb');
    composer.setModel('sonnet');
    composer.setEffort('high');

    composer.sent('00000000000000bb');

    expect(useComposerStore.getState()).toMatchObject({
      text: '',
      chips: [],
      picked: null,
      lastUsed: '00000000000000bb',
      model: 'sonnet',
      effort: 'high',
    });
    expect(JSON.parse(localStorage.getItem('devhub.home') ?? '{}')).toEqual({
      state: { lastUsed: '00000000000000bb', model: 'sonnet', effort: 'high', mode: 'build' },
      version: 0,
    });
  });

  it('spec 031, Q1: Build the first time, then your last pick, kept after Send and on this computer', () => {
    expect(useComposerStore.getState().mode).toBe('build');
    useComposerStore.getState().setMode('ask');
    useComposerStore.getState().sent(null);
    expect(useComposerStore.getState().mode).toBe('ask');
    expect(JSON.parse(localStorage.getItem('devhub.home') ?? '{}')).toMatchObject({ state: { mode: 'ask' } });
  });
});
