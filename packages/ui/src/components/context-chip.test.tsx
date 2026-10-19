import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { File02Icon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Composer, ComposerBar, ComposerSend, ComposerTextarea } from './composer.tsx';
import { ContextChip, ContextList, ContextMore } from './context-chip.tsx';
import { SourceMark } from './source-mark.tsx';
import { Icon } from './icon.tsx';

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
            icon={item.file ? <Icon icon={File02Icon} /> : <SourceMark source="jira" label="none" />}
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

  it('AC-11: a remove button shows "Remove" in a tooltip on focus, and Send shows its name', async () => {
    const user = userEvent.setup();
    render(<ComposerWithContext />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Remove PROJ-1423' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Remove');

    await user.click(screen.getByRole('textbox', { name: 'Describe a task for Claude' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Send to Claude' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Send to Claude');
  });
});

describe('ContextChip with onOpen', () => {
  it('makes its text a button that opens it, and Remove still moves focus to the next chip’s Remove', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    function Two() {
      const [items, setItems] = useState(['PROJ-1423', 'PROJ-1424']);
      return (
        <ContextList aria-label="Context for Claude">
          {items.map((label) => (
            <ContextChip
              key={label}
              label={label}
              onOpen={() => {
                onOpen(label);
              }}
              onRemove={() => {
                setItems((now) => now.filter((other) => other !== label));
              }}
            />
          ))}
        </ContextList>
      );
    }
    const { container } = render(<Two />);

    await user.click(screen.getByRole('button', { name: 'PROJ-1424' }));
    expect(onOpen).toHaveBeenCalledWith('PROJ-1424');

    await user.click(screen.getByRole('button', { name: 'Remove PROJ-1423' }));
    expect(screen.getByRole('button', { name: 'Remove PROJ-1424' })).toHaveFocus();
    await expectNoAxeViolations(container);
  });
});

describe('ContextMore (spec 022)', () => {
  function Strip({ onOpen }: { onOpen: () => void }) {
    return (
      <Composer>
        <ContextList aria-label="Context for Claude">
          <ContextChip label="PROJ-1423" icon={<SourceMark source="jira" label="none" />} onRemove={() => undefined} />
          <ContextChip
            label="web-app #2836"
            icon={<SourceMark source="github" label="none" />}
            onRemove={() => undefined}
          />
          <ContextMore count={3} label="Show all 5 items of context" tooltip="Show all context" onClick={onOpen} />
        </ContextList>
        <ComposerTextarea label="Describe a task for Claude" />
      </Composer>
    );
  }

  it('AC-19: after two chips, says how many more as "+3", named in full, with its tooltip on focus', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const { container } = render(<Strip onOpen={onOpen} />);

    const list = screen.getByRole('list', { name: 'Context for Claude' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const more = within(list).getByRole('button', { name: '+3: Show all 5 items of context' });
    expect(more).toHaveTextContent('+3');
    expect(more).toHaveAttribute('aria-haspopup', 'dialog');

    more.focus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Show all context');
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});
