import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileText } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from './composer.tsx';
import { ContextChip, ContextList } from './context-chip.tsx';
import { SourceMark } from './source-mark.tsx';

interface Item {
  id: string;
  label: string;
  file?: boolean;
}

const start: Item[] = [
  { id: 'PROJ-1423', label: 'PROJ-1423' },
  { id: 'notes', label: 'release-notes-for-the-bulk-archive-change-and-the-api-errors.md', file: true },
  { id: '2836', label: 'web-app #2836' },
];

function ComposerWithContext({ onRemove }: { onRemove?: (id: string) => void }) {
  const [items, setItems] = useState(start);
  return (
    <Composer>
      <ContextList aria-label="Context for Claude">
        {items.map((item) => (
          <ContextChip
            key={item.id}
            label={item.label}
            icon={item.file ? <FileText /> : <SourceMark source="jira" label="none" />}
            onRemove={() => {
              onRemove?.(item.id);
              setItems((now) => now.filter((other) => other.id !== item.id));
            }}
          />
        ))}
      </ContextList>
      <ComposerTextarea label="Describe a task for Claude" />
      <ComposerBar>
        <ComposerSend label="Send to Claude" />
      </ComposerBar>
    </Composer>
  );
}

describe('ContextChip', () => {
  it('AC-12: lists what Claude will work from, each with its text, its full text on hover and a named remove button', async () => {
    const { container } = render(<ComposerWithContext />);

    const list = screen.getByRole('list', { name: 'Context for Claude' });
    const chips = within(list).getAllByRole('listitem');
    expect(chips).toHaveLength(3);
    const long = 'release-notes-for-the-bulk-archive-change-and-the-api-errors.md';
    expect(within(list).getByText(long)).toHaveAttribute('title', long);
    expect(
      within(list)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Remove PROJ-1423',
      'Remove release-notes-for-the-bulk-archive-change-and-the-api-errors.md',
      'Remove web-app #2836',
    ]);
    await expectNoAxeViolations(container);
  });

  it('AC-13: removing a chip tells the screen which one and moves focus to the next remove button', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<ComposerWithContext onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove PROJ-1423' }));

    expect(onRemove).toHaveBeenCalledWith('PROJ-1423');
    expect(screen.queryByText('PROJ-1423')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Remove release-notes/ })).toHaveFocus();
  });

  it('AC-13: removing the last chip moves focus to the text box', async () => {
    const user = userEvent.setup();
    render(<ComposerWithContext />);

    screen.getByRole('button', { name: 'Remove web-app #2836' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('textbox', { name: 'Describe a task for Claude' })).toHaveFocus();
  });
});
