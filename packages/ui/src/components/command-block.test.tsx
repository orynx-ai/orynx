import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Button } from './button.tsx';
import { CommandBlock } from './command-block.tsx';
import { Pill } from './pill.tsx';

describe('CommandBlock', () => {
  it('AC-4: shows the command, how it went, and its output line by line', async () => {
    const { container } = render(
      <CommandBlock
        command="git status"
        status="✓ 0.1s"
        tone="success"
        output={['On branch feat/PROJ-1423', '  modified:   src/a.ts']}
      />,
    );
    expect(screen.getByRole('group', { name: 'git status' })).toBeVisible();
    const command = screen.getByText('git status');
    expect(command).toHaveAttribute('title', 'git status');
    expect(screen.getByText('✓ 0.1s')).toBeVisible();
    expect(container.querySelector('pre')?.textContent).toBe('On branch feat/PROJ-1423\n  modified:   src/a.ts');
    await expectNoAxeViolations(container);
  });

  it('AC-5: a failed command says so and offers its actions, which act on a click', async () => {
    const rerun = vi.fn();
    render(
      <CommandBlock
        command="pnpm test"
        status="✗ exit 1 · 3.1s"
        tone="danger"
        output={['Tests: 1 failed']}
        actions={
          <Button size="sm" variant="secondary" onClick={rerun}>
            Rerun
          </Button>
        }
      />,
    );
    expect(screen.getByText('✗ exit 1 · 3.1s')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Rerun' }));
    expect(rerun).toHaveBeenCalledOnce();
  });

  it('AC-16, AC-19: marks Claude’s commands with a badge, and says when older lines were dropped', () => {
    render(
      <CommandBlock
        command="npm test"
        badge={<Pill tone="info">Claude</Pill>}
        status="● running"
        tone="warning"
        note="Showing the last 2,000 lines."
        output={['line 2001']}
      />,
    );
    expect(screen.getByText('Claude')).toBeVisible();
    expect(screen.getByText('Showing the last 2,000 lines.')).toBeVisible();
  });

  it('AC-21, AC-22: holds what goes under the head, such as an approval’s choices, and no output box without output', async () => {
    const { container } = render(
      <CommandBlock command="npm install date-fns" status="● waiting for you" tone="warning">
        <p>Claude wants to run this.</p>
        <Button size="sm">Allow once</Button>
      </CommandBlock>,
    );
    expect(screen.getByText('Claude wants to run this.')).toBeVisible();
    expect(within(container).getByRole('button', { name: 'Allow once' })).toBeVisible();
    expect(container.querySelector('pre')).toBeNull();
    await expectNoAxeViolations(container);
  });
});
