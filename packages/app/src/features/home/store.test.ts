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
    expect(composer.addChip({ kind: 'file', name: 'notes.md', text: 'x' })).toBeNull();
    expect(composer.addChip({ kind: 'jira', key: 'PROJ-1423' })).toBeNull();
    composer.pickFolder('00000000000000bb');

    expect(useComposerStore.getState()).toMatchObject({
      text: 'Use the notes',
      chips: [
        { kind: 'file', name: 'notes.md', text: 'x' },
        { kind: 'jira', key: 'PROJ-1423' },
      ],
      picked: '00000000000000bb',
    });
  });

  it('AC-9 (Q2): a second ticket takes the first one’s place; a fourth pull request is refused', () => {
    const composer = useComposerStore.getState();
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.addChip({ kind: 'jira', key: 'PROJ-7' });
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'jira', key: 'PROJ-7' }]);

    for (const number of [1, 2, 3]) composer.addChip({ kind: 'pull_request', owner: 'acme', name: 'web-app', number });
    expect(composer.addChip({ kind: 'pull_request', owner: 'acme', name: 'web-app', number: 4 })).toBe(
      'too_many_pull_requests',
    );
    expect(useComposerStore.getState().chips).toHaveLength(4);
  });

  it('AC-15: removes one chip by its place', () => {
    const composer = useComposerStore.getState();
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.addChip({ kind: 'file', name: 'notes.md', text: 'x' });
    composer.removeChip(0);
    expect(useComposerStore.getState().chips).toEqual([{ kind: 'file', name: 'notes.md', text: 'x' }]);
  });

  it('AC-4: a sent draft is cleared and its folder remembered; only that folder is kept on this computer', () => {
    const composer = useComposerStore.getState();
    composer.setText('Add a CSV export');
    composer.addChip({ kind: 'jira', key: 'PROJ-1423' });
    composer.pickFolder('00000000000000bb');

    composer.sent('00000000000000bb');

    expect(useComposerStore.getState()).toMatchObject({
      text: '',
      chips: [],
      picked: null,
      lastUsed: '00000000000000bb',
    });
    expect(JSON.parse(localStorage.getItem('devhub.home') ?? '{}')).toEqual({
      state: { lastUsed: '00000000000000bb' },
      version: 0,
    });
  });
});
