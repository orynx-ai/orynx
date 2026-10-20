import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { CommandInput } from './command-input.tsx';

/** As a form would: the field's value set from outside when a command is recalled. */
function Recalling({ history, onInterrupt }: { history: string[]; onInterrupt?: () => void }) {
  const [value, setValue] = useState('');
  return (
    <CommandInput
      label="Command"
      hint="↑ history · Enter to run"
      history={history}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
      }}
      onRecall={setValue}
      {...(onInterrupt === undefined ? {} : { onInterrupt })}
    />
  );
}

describe('CommandInput', () => {
  it('AC-1: is a field named for screen readers, with the prompt and the hint beside it', async () => {
    const { container } = render(<Recalling history={[]} />);
    expect(screen.getByRole('textbox', { name: 'Command' })).toBeVisible();
    expect(screen.getByText('↑ history · Enter to run')).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('AC-12: ↑ walks the commands you ran, newest first, and ↓ comes back to an empty field', async () => {
    const user = userEvent.setup();
    render(<Recalling history={['git status', 'pnpm test']} />);
    const field = screen.getByRole('textbox', { name: 'Command' });
    await user.click(field);

    await user.keyboard('{ArrowUp}');
    expect(field).toHaveValue('pnpm test');
    await user.keyboard('{ArrowUp}');
    expect(field).toHaveValue('git status');
    await user.keyboard('{ArrowUp}');
    expect(field).toHaveValue('git status');
    await user.keyboard('{ArrowDown}');
    expect(field).toHaveValue('pnpm test');
    await user.keyboard('{ArrowDown}');
    expect(field).toHaveValue('');
  });

  it('AC-12: starts from the newest again once a new command joins the history', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Recalling history={['git status']} />);
    await user.click(screen.getByRole('textbox', { name: 'Command' }));
    await user.keyboard('{ArrowUp}');
    rerender(<Recalling history={['git status', 'ls']} />);
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('textbox', { name: 'Command' })).toHaveValue('ls');
  });

  it('AC-9: ⌃C stops what runs, unless you have text selected, which it leaves for copying', async () => {
    const user = userEvent.setup();
    const interrupt = vi.fn();
    render(<Recalling history={[]} onInterrupt={interrupt} />);
    const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Command' });
    await user.click(field);
    await user.keyboard('{Control>}c{/Control}');
    expect(interrupt).toHaveBeenCalledOnce();

    await user.type(field, 'pwd');
    field.setSelectionRange(0, 3);
    await user.keyboard('{Control>}c{/Control}');
    expect(interrupt).toHaveBeenCalledOnce();
  });
});
