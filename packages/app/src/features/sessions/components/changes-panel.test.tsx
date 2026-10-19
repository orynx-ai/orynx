import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes, type FileDiff, type Session, type SessionChanges } from '@devhub/contracts';
import {
  makeChangedFile,
  makeFileDiff,
  makePreferences,
  makeSession,
  makeSessionChanges,
} from '@devhub/contracts/testing';
import { FakeEventSource } from '../../../test/fake-event-source.ts';
import { apiUrl, server, sessionHandler } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';

const id = '0123456789abcdef';
const worktreePath = '/Users/you/.devhub/worktrees/0123456789abcdef';
const working = makeSession({ id, state: 'working', step: 'build', worktreePath });
const done = makeSession({ id, state: 'done', step: 'review', worktreePath });

/** The session, its changes and each file's diff as the server holds them; `asked` lists the diffs the page read. */
function serve(session: Session, changes: SessionChanges | 'fails', diffs: Record<string, FileDiff> = {}) {
  const state = { changes, asked: [] as string[], reads: 0 };
  server.use(
    sessionHandler(session),
    http.get(apiUrl(apiRoutes.sessionChanges), () => {
      state.reads += 1;
      return state.changes === 'fails'
        ? HttpResponse.json({ code: 'internal', message: 'x' }, { status: 500 })
        : HttpResponse.json(state.changes);
    }),
    http.get(apiUrl(apiRoutes.sessionChangesDiff), ({ request }) => {
      const path = new URL(request.url).searchParams.get('path') ?? '';
      state.asked.push(path);
      const diff = diffs[path];
      return diff === undefined
        ? HttpResponse.json({ code: 'not_found', message: 'x' }, { status: 404 })
        : HttpResponse.json(diff);
    }),
  );
  return state;
}

const contentList = makeFileDiff();
const contentApi = makeFileDiff({
  path: 'src/content/api/contentApi.ts',
  lines: [
    { kind: 'hunk', text: '@@ -1,2 +1,3 @@' },
    { kind: 'context', number: 1, text: 'export const api = {' },
    { kind: 'added', number: 2, text: '  bulkArchive: (ids: string[]) => post("/archive", { ids }),' },
  ],
});

describe('ChangesPanel', () => {
  it('AC-2: lists the changed files with their counts, sums them up while Claude works, and shows the first diff', async () => {
    serve(working, makeSessionChanges(), { [contentList.path]: contentList });
    await renderApp({ route: `/sessions/${id}` });

    const list = await screen.findByRole('list', { name: 'Changed files' });
    expect(within(list).getAllByRole('button', { name: /^src\// })).toHaveLength(4);
    expect(screen.getByText('in 4 files · updates live as Claude edits')).toBeVisible();
    expect(screen.getByText('142 lines added, 18 lines removed in 4 files')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /^src\/content\/ContentList\.tsx/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const diff = await screen.findByRole('region', { name: 'Changes in ContentList.tsx' });
    expect(within(diff).getByText('const archive = useBulkArchive();', { exact: false })).toBeVisible();
  });

  it('AC-2: says nothing about updating live once Claude has finished', async () => {
    serve(done, makeSessionChanges(), { [contentList.path]: contentList });
    await renderApp({ route: `/sessions/${id}` });
    expect(await screen.findByText('in 4 files')).toBeVisible();
  });

  it('AC-3: picking a file shows its diff and puts it in the address, so a reload shows it again', async () => {
    const state = serve(done, makeSessionChanges(), { [contentList.path]: contentList, [contentApi.path]: contentApi });
    const { user, history } = await renderApp({ route: `/sessions/${id}` });

    await user.click(await screen.findByRole('button', { name: /^src\/content\/api\/contentApi\.ts/ }));

    expect(await screen.findByRole('region', { name: 'Changes in contentApi.ts' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^src\/content\/api\/contentApi\.ts/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(new URLSearchParams(history.location.search).get('file')).toBe('src/content/api/contentApi.ts');
    expect(state.asked).toContain('src/content/api/contentApi.ts');
  });

  it('AC-3: opens on the file the address names', async () => {
    serve(done, makeSessionChanges(), { [contentApi.path]: contentApi });
    await renderApp({ route: `/sessions/${id}?file=${encodeURIComponent(contentApi.path)}` });
    expect(await screen.findByRole('region', { name: 'Changes in contentApi.ts' })).toBeVisible();
  });

  it('AC-2, AC-18: refetches when the server says the files changed, and keeps the file you were looking at', async () => {
    const state = serve(working, makeSessionChanges({ files: [makeChangedFile()], added: 68, removed: 9 }), {
      [contentList.path]: contentList,
    });
    await renderApp({ route: `/sessions/${id}` });
    await screen.findByRole('region', { name: 'Changes in ContentList.tsx' });

    state.changes = makeSessionChanges();
    FakeEventSource.latest().emit({ type: 'session.files.changed', sessionId: 'fedcba9876543210' });
    FakeEventSource.latest().emit({ type: 'session.files.changed', sessionId: id });

    const list = screen.getByRole('list', { name: 'Changed files' });
    await waitFor(() => {
      expect(within(list).getAllByRole('button', { name: /^src\// })).toHaveLength(4);
    });
    expect(state.reads).toBe(2);
    expect(within(list).getByRole('button', { name: /^src\/content\/ContentList\.tsx/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('AC-3: shows the first file when the one in the address has dropped out of the changes', async () => {
    serve(done, makeSessionChanges(), { [contentList.path]: contentList });
    await renderApp({ route: `/sessions/${id}?file=src%2Fgone.ts` });
    expect(await screen.findByRole('region', { name: 'Changes in ContentList.tsx' })).toBeVisible();
  });

  it('AC-5: says a binary file isn’t shown, where a renamed one came from, when a diff was cut short, and how many more files there are', async () => {
    const binary = makeChangedFile({ path: 'public/logo.png', added: 0, removed: 0, binary: true });
    const renamed = makeChangedFile({ path: 'src/content/ContentTable.tsx', renamedFrom: 'src/content/List.tsx' });
    const state = serve(done, makeSessionChanges({ files: [binary, renamed], moreFiles: 41 }), {
      [renamed.path]: makeFileDiff({ path: renamed.path, renamedFrom: 'src/content/List.tsx', cut: true }),
    });
    const { user } = await renderApp({ route: `/sessions/${id}` });

    const binaryDiff = await screen.findByRole('region', { name: 'Changes in logo.png' });
    expect(within(binaryDiff).getByText('Binary file, not shown.')).toBeVisible();
    expect(state.asked).toEqual([]);
    expect(screen.getByText('and 41 more files')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /^src\/content\/ContentTable\.tsx/ }));
    const renamedDiff = await screen.findByRole('region', { name: 'Changes in ContentTable.tsx' });
    expect(within(renamedDiff).getByText('Renamed from src/content/List.tsx')).toBeVisible();
    expect(
      within(renamedDiff).getByText('The rest of this diff is too long to show here. Open in VS Code to see it.'),
    ).toBeVisible();
  });

  it.each([
    [
      'no changes yet',
      makeSessionChanges({ files: [], added: 0, removed: 0 }),
      'No changes yet',
      'Files show here as Claude changes them.',
    ],
    [
      'no worktree',
      { state: 'no_worktree' } as const,
      'No changes',
      'The session stopped before Orynx made a worktree.',
    ],
    [
      'a missing worktree',
      { state: 'missing' } as const,
      'The worktree is missing',
      'It was moved or deleted outside Orynx. Discard the session to tidy up.',
    ],
  ])('AC-6: says why there’s nothing to show for %s', async (_case, changes, title, line) => {
    serve(done, changes);
    await renderApp({ route: `/sessions/${id}` });
    expect(await screen.findByText(title)).toBeVisible();
    expect(screen.getByText(line)).toBeVisible();
  });

  it('AC-6: says the changes are gone once discarded, without Open in or Discard', async () => {
    serve(makeSession({ id, state: 'stopped', discardedAt: '2026-10-16T10:05:00.000Z', worktreePath: null }), {
      state: 'discarded',
    });
    await renderApp({ route: `/sessions/${id}` });
    expect(await screen.findByText('The changes are gone')).toBeVisible();
    expect(screen.getByText('The worktree and feat/PROJ-1423 were deleted.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open in VS Code' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard changes' })).toBeNull();
  });

  it('AC-7: says the changes couldn’t be read, and Try again reads them', async () => {
    const state = serve(done, 'fails', { [contentList.path]: contentList });
    const { user } = await renderApp({ route: `/sessions/${id}` });

    expect(await screen.findByText("Couldn't read the changes.")).toBeVisible();
    state.changes = makeSessionChanges();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Changed files' })).toBeVisible();
  });

  it('AC-20, AC-26: opens the worktree in the editor Settings picks, beside Discard changes', async () => {
    serve(done, makeSessionChanges(), { [contentList.path]: contentList });
    await renderApp({ route: `/sessions/${id}` });
    expect(await screen.findByRole('link', { name: 'Open in VS Code' })).toHaveAttribute(
      'href',
      `vscode://file${worktreePath}`,
    );
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeVisible();
  });

  it('AC-26: says Open in Cursor when Settings picks Cursor', async () => {
    serve(done, makeSessionChanges(), { [contentList.path]: contentList });
    server.use(http.get(apiUrl(apiRoutes.preferences), () => HttpResponse.json(makePreferences({ editor: 'cursor' }))));
    await renderApp({ route: `/sessions/${id}` });
    expect(await screen.findByRole('link', { name: 'Open in Cursor' })).toHaveAttribute(
      'href',
      `cursor://file${worktreePath}`,
    );
  });
});
