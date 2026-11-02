import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileSearchIcon, PencilEdit01Icon, TerminalIcon } from '@hugeicons/core-free-icons';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { ActivityChecklist, ActivityGroup, ActivityList, ActivityStep } from './activity-step.tsx';
import { Icon } from './icon.tsx';

describe('ActivityStep', () => {
  it("AC-25: lists Claude's steps with their title and detail, in a polite live region", async () => {
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep
          state="done"
          icon={<Icon icon={FileSearchIcon} />}
          title="Read 6 files"
          detail="ContentList.tsx and 5 more"
        />
        <ActivityStep state="done" icon={<Icon icon={PencilEdit01Icon} />} title="Edited 4 files" detail="+142 −18" />
        <ActivityStep
          state="waiting"
          icon={<Icon icon={TerminalIcon} />}
          title="Wants to run npm test"
          detail="Waiting for you"
        />
        <ActivityStep icon={<Icon icon={TerminalIcon} />} title="Run the linter" />
      </ActivityList>,
    );

    const list = screen.getByRole('list', { name: "Claude's progress" });
    expect(list).toHaveAttribute('aria-live', 'polite');
    const steps = within(list).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Read 6 files, doneContentList.tsx and 5 more',
      'Edited 4 files, done+142 −18',
      'Wants to run npm test, needs youWaiting for you',
      'Run the linter',
    ]);
    // The state is in words for screen readers, not only in the dot's colour.
    expect(within(steps[0] ?? list).getByText(', done')).toHaveClass('sr-only');
    expect(within(list).getByText(', needs you')).toHaveClass('sr-only');
    // The dots and their icons are for the eye only.
    expect(within(list).queryByRole('img')).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-1, AC-3 (spec 046): a running step shimmers on its title alone, and one waiting for you never does', () => {
    render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep running icon={<Icon icon={FileSearchIcon} />} title="Exploring the code" detail="a.ts" />
        <ActivityStep running state="waiting" icon={<Icon icon={TerminalIcon} />} title="Wants to run npm test" />
        <ActivityStep state="done" icon={<Icon icon={PencilEdit01Icon} />} title="Edited 2 files" />
      </ActivityList>,
    );
    // The band runs only where motion is allowed: under reduced motion the title is plain text (AC-2).
    expect(screen.getByText('Exploring the code')).toHaveClass('motion-safe:shimmer', 'motion-safe:animate-shimmer');
    expect(screen.getByText('a.ts')).not.toHaveClass('motion-safe:shimmer');
    expect(screen.getByText('Wants to run npm test')).not.toHaveClass('motion-safe:shimmer');
    expect(screen.getByText('Edited 2 files')).not.toHaveClass('motion-safe:shimmer');
    // A screen reader hears nothing new: the title's own tense says it's running.
    expect(screen.getAllByRole('listitem')[0]?.textContent).toBe('Exploring the codea.ts');
  });

  it('AC-12 (spec 046): a failed step says so in words as well as in red', async () => {
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep state="failed" icon={<Icon icon={TerminalIcon} />} title="A command failed" />
      </ActivityList>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('A command failed, failed');
    expect(screen.getByText(', failed')).toHaveClass('sr-only');
    await expectNoAxeViolations(container);
  });

  it('AC-5, AC-9, AC-10 (spec 046): a step with details opens and closes in place by its title, several at once', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep
          state="done"
          icon={<Icon icon={PencilEdit01Icon} />}
          title="Edited 2 files"
          detail="a.ts and b.ts"
          details={<p>src/a.ts and src/b.ts</p>}
        />
        <ActivityStep
          state="done"
          icon={<Icon icon={FileSearchIcon} />}
          title="Explored the code"
          details={<p>src/c.ts</p>}
        />
        <ActivityStep state="done" icon={<Icon icon={TerminalIcon} />} title="Made the worktree" />
      </ActivityList>,
    );
    const edited = screen.getByRole('button', { name: 'Edited 2 files' });
    expect(edited).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('src/a.ts and src/b.ts')).not.toBeInTheDocument();

    await user.click(edited);
    expect(edited).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('src/a.ts and src/b.ts')).toBeVisible();
    // Nothing opens over the page.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // The detail line stays outside the button, so a link in it still works.
    expect(edited).not.toHaveTextContent('a.ts and b.ts');

    await user.click(screen.getByRole('button', { name: 'Explored the code' }));
    expect(screen.getByText('src/a.ts and src/b.ts')).toBeVisible();
    expect(screen.getByText('src/c.ts')).toBeVisible();

    await user.click(edited);
    expect(edited).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('src/a.ts and src/b.ts')).not.toBeInTheDocument();
    // A step with nothing more to show has no button.
    expect(screen.queryByRole('button', { name: 'Made the worktree' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-19 (spec 046): its title is one Tab stop that Enter and Space open and close, then the details come next', async () => {
    const user = userEvent.setup();
    render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep
          state="done"
          icon={<Icon icon={PencilEdit01Icon} />}
          title="Edited 1 file"
          details={<button type="button">Copy src/a.ts</button>}
        />
      </ActivityList>,
    );
    await user.tab();
    const title = screen.getByRole('button', { name: 'Edited 1 file' });
    expect(title).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(title).toHaveAttribute('aria-expanded', 'true');
    expect(title).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Copy src/a.ts' })).toHaveFocus();
    await user.tab({ shift: true });
    await user.keyboard(' ');
    expect(title).toHaveAttribute('aria-expanded', 'false');
    expect(title).toHaveFocus();
  });

  it('a step with more to show has a title you can press', async () => {
    const onOpen = vi.fn();
    const { container } = render(
      <ActivityList aria-label="Claude's progress">
        <ActivityStep state="done" icon={<Icon icon={FileSearchIcon} />} title="Read 6 files" onOpen={onOpen} />
      </ActivityList>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Read 6 files' }));
    expect(onOpen).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});

describe('ActivityChecklist (spec 046)', () => {
  it('AC-16: marks what Claude did, shimmers what it is on, and outlines what is to come, in words too', async () => {
    const { container } = render(
      <ActivityChecklist
        aria-label="Made a plan"
        items={[
          { text: 'Read the route', status: 'completed' },
          { text: 'Add the endpoint', status: 'in_progress' },
          { text: 'Write the tests', status: 'pending' },
        ]}
      />,
    );
    const items = within(screen.getByRole('list', { name: 'Made a plan' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      'Read the route, done',
      'Add the endpoint',
      'Write the tests, to come',
    ]);
    expect(screen.getByText('Add the endpoint')).toHaveClass('motion-safe:shimmer');
    expect(screen.getByText('Write the tests')).toHaveClass('text-muted-foreground');
    await expectNoAxeViolations(container);
  });

  it('AC-14: items with no status are a plain list with no marks', () => {
    render(<ActivityChecklist aria-label="Made a plan" items={[{ text: 'Read the route' }, { text: 'Add it' }]} />);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Read the route', 'Add it']);
    expect(screen.getByText('Read the route')).not.toHaveClass('motion-safe:shimmer');
  });
});

describe('ActivityGroup (spec 048)', () => {
  /** A step's group, with as many rows as asked, opened or closed by its own row. */
  function Fixes({ rows = 1, defaultOpen = false }: { rows?: number; defaultOpen?: boolean }) {
    return (
      <ActivityList aria-label="What Claude did">
        <ActivityGroup
          state="done"
          icon={<Icon icon={PencilEdit01Icon} />}
          title="Apply fixes"
          summary="Edited 4 files"
          time="18 min"
          defaultOpen={defaultOpen}
        >
          <ActivityList aria-label="Apply fixes">
            {Array.from({ length: rows }, (_, row) => (
              <ActivityStep
                key={row}
                state="done"
                icon={<Icon icon={PencilEdit01Icon} />}
                title={`Edited file ${String(row + 1)}`}
              />
            ))}
          </ActivityList>
        </ActivityGroup>
      </ActivityList>
    );
  }

  it('AC-10: shows the step, its summary and its time, and says it is done to a screen reader', async () => {
    const { container } = render(<Fixes />);
    const row = screen.getByRole('button', { name: /^Apply fixes, done/ });
    expect(row).toHaveTextContent('Apply fixes, doneEdited 4 files18 min');
    expect(within(row).getByText(', done')).toHaveClass('sr-only');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Apply fixes' })).not.toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-11: opens its rows in place on a press, Enter or Space, closes again, and keeps focus', async () => {
    const user = userEvent.setup();
    const { container } = render(<Fixes />);
    const row = screen.getByRole('button', { name: /^Apply fixes/ });
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('list', { name: 'Apply fixes' })).getByText('Edited file 1')).toBeVisible();
    await expectNoAxeViolations(container);
    expect(row).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(row).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard(' ');
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(row).toHaveFocus();
  });

  it('AC-14: stays open as rows come, and opens or closes from outside when told', async () => {
    const { rerender } = render(<Fixes defaultOpen />);
    rerender(<Fixes defaultOpen rows={2} />);
    expect(screen.getByRole('button', { name: /^Apply fixes/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Edited file 2')).toBeVisible();

    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
            }}
          >
            Expand all
          </button>
          <ActivityList aria-label="Steps">
            <ActivityGroup icon={<Icon icon={TerminalIcon} />} title="Run tests" open={open} onOpenChange={setOpen}>
              <p>npm test</p>
            </ActivityGroup>
          </ActivityList>
        </>
      );
    }
    rerender(<Controlled />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getByRole('button', { name: 'Run tests' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('npm test')).toBeVisible();
  });
});
