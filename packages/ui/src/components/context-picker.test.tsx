import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import {
  ContextKindItem,
  ContextPicker,
  ContextPickerContent,
  ContextPickerLabel,
  ContextPickerTrigger,
} from './context-picker.tsx';
import { SourceMark } from './source-mark.tsx';

/** The + menu's first view, as Home draws it: the kinds, each leading on but File. */
function Kinds({ onPick = () => undefined }: { onPick?: (kind: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ContextPicker open={open} onOpenChange={setOpen}>
        <ContextPickerTrigger />
        <ContextPickerContent
          view="kinds"
          aria-label="Add context"
          foot="Tip: you can also paste a Jira key or a pull request link into the box."
        >
          <ContextPickerLabel>Add context for Claude</ContextPickerLabel>
          <ContextKindItem
            description="The folder Claude works in"
            leadsOn
            onSelect={() => {
              onPick('repository');
            }}
          >
            Git repository
          </ContextKindItem>
          <ContextKindItem
            icon={<SourceMark source="jira" label="none" />}
            description="Search by key or title"
            leadsOn
            onSelect={() => {
              onPick('jira');
            }}
          >
            Jira ticket
          </ContextKindItem>
          <ContextKindItem
            description="Text files up to 100 KB"
            onSelect={() => {
              onPick('file');
            }}
          >
            File from this computer
          </ContextKindItem>
        </ContextPickerContent>
      </ContextPicker>
      <button type="button">After</button>
    </>
  );
}

describe('ContextPicker: the kinds (spec 015)', () => {
  it('AC-6: + opens a menu of what Claude can work from, with its label, descriptions and tip', async () => {
    const user = userEvent.setup();
    const { container } = render(<Kinds />);

    const plus = screen.getByRole('button', { name: 'Add context' });
    expect(plus).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(plus);

    const menu = await screen.findByRole('menu', { name: 'Add context' });
    expect(plus).toHaveAttribute('aria-expanded', 'true');
    expect(menu).toHaveAccessibleDescription('Tip: you can also paste a Jira key or a pull request link into the box.');
    expect(screen.getByText('Add context for Claude')).toBeVisible();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Git repositoryThe folder Claude works in',
      'Jira ticketSearch by key or title',
      'File from this computerText files up to 100 KB',
    ]);
    expect(screen.getByRole('menuitem', { name: /Git repository/ })).toHaveFocus();
    await expectNoAxeViolations(container);
    await expectNoAxeViolations(menu);
  });

  it('AC-6: arrow keys move through the kinds, Home and End jump, and Enter picks', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    render(<Kinds onPick={(kind) => picked.push(kind)} />);
    await user.click(screen.getByRole('button', { name: 'Add context' }));
    await screen.findByRole('menu', { name: 'Add context' });

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Jira ticket/ })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: /File from this computer/ })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /Git repository/ })).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: /File from this computer/ })).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(picked).toEqual(['repository']);
  });

  it('AC-6: Esc closes it and puts focus back on +', async () => {
    const user = userEvent.setup();
    render(<Kinds />);
    const plus = screen.getByRole('button', { name: 'Add context' });
    await user.click(plus);
    await screen.findByRole('menu', { name: 'Add context' });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).toBeNull();
    expect(plus).toHaveFocus();
  });

  it('AC-6: a kind that leads on shows a chevron; one that acts at once has none', async () => {
    const user = userEvent.setup();
    render(<Kinds />);
    await user.click(screen.getByRole('button', { name: 'Add context' }));
    const jira = await screen.findByRole('menuitem', { name: /Jira ticket/ });
    expect(jira.querySelectorAll('svg')).toHaveLength(2);
    expect(screen.getByRole('menuitem', { name: /File from this computer/ }).querySelectorAll('svg')).toHaveLength(0);
  });
});
