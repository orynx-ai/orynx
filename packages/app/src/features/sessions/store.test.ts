import { beforeEach, describe, expect, it } from 'vitest';
import { initialDiffView, isViewed, useDiffView } from './store.ts';

const file = { path: 'src/content/ContentList.tsx', added: 68, removed: 9 };

/** A new page load: the store starts from its defaults, then reads what this browser kept. */
async function reload() {
  const kept = localStorage.getItem('devhub.diff');
  useDiffView.setState(initialDiffView);
  if (kept !== null) localStorage.setItem('devhub.diff', kept);
  await useDiffView.persist.rehydrate();
}

describe('how the Changes tab shows a diff (spec 048)', () => {
  beforeEach(() => {
    localStorage.clear();
    useDiffView.setState(initialDiffView);
  });

  it('AC-20: wraps lines until you turn it off, and remembers that in this browser for every session', async () => {
    expect(useDiffView.getState().wrap).toBe(true);
    useDiffView.getState().setWrap(false);
    await reload();
    expect(useDiffView.getState().wrap).toBe(false);
  });

  it('AC-22: a file you ticked Viewed stays ticked for that session, until Claude changes it again', async () => {
    useDiffView.getState().setViewed('s1', file, true);
    expect(isViewed(useDiffView.getState(), 's1', file)).toBe(true);
    expect(isViewed(useDiffView.getState(), 's2', file)).toBe(false);

    await reload();
    expect(isViewed(useDiffView.getState(), 's1', file)).toBe(true);

    expect(isViewed(useDiffView.getState(), 's1', { ...file, added: 70 })).toBe(false);
    useDiffView.getState().setViewed('s1', file, false);
    expect(isViewed(useDiffView.getState(), 's1', file)).toBe(false);
  });
});
