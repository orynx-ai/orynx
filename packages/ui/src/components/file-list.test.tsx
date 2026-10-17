import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { FileList, FileListSkeleton, type ChangedFile } from './file-list.tsx';

const files: ChangedFile[] = [
  { path: 'src/content/ContentList.tsx', added: 68, removed: 9 },
  { path: 'src/content/api/contentApi.ts', added: 31, removed: 2 },
  { path: 'src/content/useSelection.ts', added: 1, removed: 1 },
  { path: 'src/content/__tests__/bulkArchive.test.ts', added: 21, removed: 0 },
];

describe('FileList', () => {
  it('AC-20: lists the changed files with their counts, read as words, and marks the shown one', async () => {
    const { container } = render(
      <FileList
        aria-label="Changed files"
        files={files}
        current="src/content/ContentList.tsx"
        onSelect={() => undefined}
      />,
    );

    const list = screen.getByRole('list', { name: 'Changed files' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual([
      'src/content/ContentList.tsx +68−968 lines added, 9 lines removed',
      'src/content/api/contentApi.ts +31−231 lines added, 2 lines removed',
      'src/content/useSelection.ts +1−11 line added, 1 line removed',
      'src/content/__tests__/bulkArchive.test.ts +2121 lines added',
    ]);
    // Each is named by its path and its counts as words; the drawn "+68 −9" isn't read out.
    expect(buttons[0]).toHaveAccessibleName('src/content/ContentList.tsx 68 lines added, 9 lines removed');
    expect(buttons[1]).toHaveAccessibleName('src/content/api/contentApi.ts 31 lines added, 2 lines removed');
    expect(buttons[2]).toHaveAccessibleName('src/content/useSelection.ts 1 line added, 1 line removed');
    expect(buttons[3]).toHaveAccessibleName('src/content/__tests__/bulkArchive.test.ts 21 lines added');
    expect(
      screen.getByRole('button', { name: 'src/content/ContentList.tsx 68 lines added, 9 lines removed' }),
    ).toHaveAttribute('aria-current', 'true');
    expect(buttons.filter((button) => button.hasAttribute('aria-current'))).toHaveLength(1);
    // The full path shows on hover, since the folder part can be cut off.
    expect(buttons[1]).toHaveAttribute('title', 'src/content/api/contentApi.ts');
    await expectNoAxeViolations(container);
  });

  it('AC-21: picking a file tells the screen, and the list waits for the screen to show it', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const { rerender } = render(
      <FileList aria-label="Changed files" files={files} current="src/content/ContentList.tsx" onSelect={onSelect} />,
    );

    await user.click(screen.getByRole('button', { name: /^src\/content\/api\/contentApi\.ts/ }));
    expect(onSelect).toHaveBeenLastCalledWith('src/content/api/contentApi.ts');
    expect(screen.getByRole('button', { name: /^src\/content\/api\/contentApi\.ts/ })).not.toHaveAttribute(
      'aria-current',
    );

    await user.tab();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('src/content/useSelection.ts');
    await user.keyboard(' ');
    expect(onSelect).toHaveBeenCalledTimes(3);

    rerender(
      <FileList aria-label="Changed files" files={files} current="src/content/useSelection.ts" onSelect={onSelect} />,
    );
    expect(screen.getByRole('button', { name: /^src\/content\/useSelection\.ts/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('AC-26: the loading rows hold the list’s place without being read out', async () => {
    const { container } = render(<FileListSkeleton rows={3} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container).toHaveTextContent('');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
