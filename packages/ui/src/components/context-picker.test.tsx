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
  ContextSearch,
  type ContextSearchOption,
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

const tickets: ContextSearchOption[] = [
  { value: 'PROJ-1423', label: 'PROJ-1423', description: 'Add bulk archive · In progress' },
  { value: 'PROJ-1377', label: 'PROJ-1377', description: 'Fix the header · To do' },
  { value: 'PROJ-1290', label: 'PROJ-1290', description: 'Tidy the footer · To do' },
];

/** Home's + with one list: the kinds, then the Jira tickets, filtered as you type. */
function Tickets({
  options = tickets,
  added = [],
  loading = false,
  notice,
  extra,
  onPick = () => undefined,
}: {
  options?: ContextSearchOption[];
  added?: string[];
  loading?: boolean;
  notice?: React.ReactNode;
  extra?: { label: string; onSelect: () => void };
  onPick?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'kinds' | 'list'>('kinds');
  const [query, setQuery] = useState('');
  const shown = options
    .filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(query.toLowerCase()))
    .map((option) => ({ ...option, added: added.includes(option.value) }));
  return (
    <ContextPicker
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setView('kinds');
        setQuery('');
      }}
    >
      <ContextPickerTrigger />
      {view === 'kinds' ? (
        <ContextPickerContent view="kinds" aria-label="Add context">
          <ContextKindItem description="The folder Claude works in" leadsOn>
            Git repository
          </ContextKindItem>
          <ContextKindItem
            description="Search by key or title"
            leadsOn
            onSelect={() => {
              setView('list');
            }}
          >
            Jira ticket
          </ContextKindItem>
        </ContextPickerContent>
      ) : (
        <ContextPickerContent view="list" aria-label="Jira ticket">
          <ContextSearch
            title="Jira ticket"
            count={`${String(shown.length)} open`}
            onBack={() => {
              setView('kinds');
            }}
            searchLabel="Search tickets by key or title"
            query={query}
            onQueryChange={setQuery}
            options={shown}
            onPick={onPick}
            emptyText="No matches. Try a key like PROJ-1423 or a repo name."
            loading={loading}
            notice={notice}
            extra={extra}
            note="Claude gets the summary, description, comments and linked issues."
          />
        </ContextPickerContent>
      )}
    </ContextPicker>
  );
}

async function openTickets(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add context' }));
  await user.click(await screen.findByRole('menuitem', { name: /Jira ticket/ }));
  return screen.findByRole('dialog', { name: 'Jira ticket' });
}

describe('ContextPicker: one kind’s list (spec 015)', () => {
  it('AC-7: shows the list in the same popup, with Back, the count, the search box in focus and the note', async () => {
    const user = userEvent.setup();
    render(<Tickets />);

    const dialog = await openTickets(user);

    const search = screen.getByRole('combobox', { name: 'Search tickets by key or title' });
    expect(search).toHaveFocus();
    expect(search).toHaveAccessibleDescription('Claude gets the summary, description, comments and linked issues.');
    expect(screen.getByText('3 open')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to all context types' })).toBeVisible();
    const list = screen.getByRole('listbox', { name: 'Jira ticket' });
    expect(list).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'PROJ-1423Add bulk archive · In progress',
      'PROJ-1377Fix the header · To do',
      'PROJ-1290Tidy the footer · To do',
    ]);
    await expectNoAxeViolations(dialog);
  });

  it('AC-7: typing narrows the list, and ↓ ↑ Enter pick the one marked', async () => {
    const user = userEvent.setup();
    const picked: string[] = [];
    render(<Tickets onPick={(value) => picked.push(value)} />);
    await openTickets(user);
    const search = screen.getByRole('combobox', { name: 'Search tickets by key or title' });

    await user.type(search, 'to do');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(search).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0]?.id);
    await user.keyboard('{ArrowDown}');
    expect(search).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]?.id);
    await user.keyboard('{ArrowDown}{ArrowUp}{End}{Enter}');
    expect(picked).toEqual(['PROJ-1290']);

    await user.click(screen.getByRole('option', { name: /PROJ-1377/ }));
    expect(picked).toEqual(['PROJ-1290', 'PROJ-1377']);
  });

  it('AC-9: an item already added shows a check and reads as selected', async () => {
    const user = userEvent.setup();
    render(<Tickets added={['PROJ-1423']} />);
    await openTickets(user);
    expect(screen.getByRole('option', { name: /PROJ-1423/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: /PROJ-1423/ }).querySelector('svg')).not.toBeNull();
    expect(screen.getByRole('option', { name: /PROJ-1377/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('AC-10: says so when nothing matches', async () => {
    const user = userEvent.setup();
    render(<Tickets />);
    await openTickets(user);
    await user.type(screen.getByRole('combobox'), 'nothing like this');
    expect(screen.queryAllByRole('option')).toEqual([]);
    expect(screen.getByText('No matches. Try a key like PROJ-1423 or a repo name.')).toBeVisible();
  });

  it('AC-32: while the first sync runs, three rows the size of real ones stand in, and screen readers hear it', async () => {
    const user = userEvent.setup();
    render(<Tickets options={[]} loading />);
    const dialog = await openTickets(user);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('No matches. Try a key like PROJ-1423 or a repo name.')).toBeNull();
    await expectNoAxeViolations(dialog);
  });

  it('AC-32: a notice, such as Jira not being connected, stands in place of the search and the list', async () => {
    const user = userEvent.setup();
    render(<Tickets notice={<a href="/settings/connections">Connect Jira in Settings to add tickets.</a>} />);
    const dialog = await openTickets(user);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('link', { name: 'Connect Jira in Settings to add tickets.' })).toBeVisible();
    await expectNoAxeViolations(dialog);
  });

  it('AC-16: an action after the list, such as Add local folder, is one Tab away', async () => {
    const user = userEvent.setup();
    const done: string[] = [];
    render(<Tickets extra={{ label: 'Add local folder…', onSelect: () => done.push('add') }} />);
    await openTickets(user);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Add local folder…' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(done).toEqual(['add']);
  });

  it('AC-7: Back returns to the kinds with focus on the one it came from, and Esc closes all of it', async () => {
    const user = userEvent.setup();
    render(<Tickets />);
    await openTickets(user);

    await user.click(screen.getByRole('button', { name: 'Back to all context types' }));
    expect(await screen.findByRole('menuitem', { name: /Jira ticket/ })).toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: /Jira ticket/ }));
    await screen.findByRole('dialog', { name: 'Jira ticket' });
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add context' })).toHaveFocus();
  });
});
