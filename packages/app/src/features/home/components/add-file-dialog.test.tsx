import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { apiRoutes } from '@devhub/contracts';
import { makeRepository } from '@devhub/contracts/testing';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { apiUrl, server } from '../../../test/msw.ts';
import { renderApp } from '../../../test/render.tsx';
import { useComposerStore } from '../store.ts';

const reason = "Orynx can't open a file picker on this computer. Type the file's path instead.";

/** No file picker on this computer, so File from this computer opens Add a file (spec 022, AC-12). */
async function openAddFile() {
  const checked: unknown[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.repositories), () =>
      HttpResponse.json({ repositories: [makeRepository({ id: '00000000000000aa' })] }),
    ),
    http.post(apiUrl(apiRoutes.filePicker), () =>
      HttpResponse.json({ code: 'picker_unavailable', message: reason }, { status: 503 }),
    ),
    http.post(apiUrl(apiRoutes.fileCheck), async ({ request }) => {
      checked.push(await request.json());
      return HttpResponse.json({ result: 'not_found' });
    }),
  );
  const app = await renderApp();
  await app.user.click(await screen.findByRole('button', { name: 'Add context' }));
  await app.user.click(await screen.findByRole('menuitem', { name: /File from this computer/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Add a file' });
  return { ...app, dialog, checked };
}

const box = () => screen.getByRole('textbox', { name: 'Describe a task for Claude' });

describe('Add a file (spec 022, AC-12)', () => {
  it('says why it opened, labels its one field, and has Cancel then Add at its end', async () => {
    const { dialog } = await openAddFile();
    expect(dialog).toHaveAccessibleDescription(reason);
    expect(within(dialog).getByRole('textbox', { name: 'Path' })).toHaveFocus();
    expect(within(dialog).getByText("The file's full path, for example ~/notes/plan.pdf.")).toBeVisible();
    const [cancel, add] = within(dialog).getAllByRole('button');
    expect(cancel).toHaveAccessibleName('Cancel');
    expect(add).toHaveAccessibleName('Add');
    await expectNoAxeViolations(dialog);
  });

  it('refuses a path that isn’t from / or ~/ before asking the server', async () => {
    const { user, dialog, checked } = await openAddFile();
    await user.type(within(dialog).getByRole('textbox', { name: 'Path' }), 'notes/plan.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByText("Type the file's full path, from / or ~/.")).toBeVisible();
    expect(checked).toEqual([]);
  });

  it('Cancel or Esc closes it with nothing added, and focus goes to the box', async () => {
    const { user, dialog } = await openAddFile();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a file' })).toBeNull();
    });
    expect(box()).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Add context' }));
    await user.click(await screen.findByRole('menuitem', { name: /File from this computer/ }));
    await screen.findByRole('dialog', { name: 'Add a file' });
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a file' })).toBeNull();
    });
    expect(useComposerStore.getState().chips).toEqual([]);
  });
});
