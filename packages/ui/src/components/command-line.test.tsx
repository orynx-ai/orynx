import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { CommandLine } from './command-line.tsx';

const command =
  'cd packages/agent-builder/src; grep -n "uploading\\|onUpload" components/avatar-picker.tsx | head -40; cat hooks/use-avatar-upload.tsx';

describe('CommandLine (spec 048)', () => {
  it('AC-13: shows a command on one line, named by the command, and in full on a press, then on one line again', async () => {
    const user = userEvent.setup();
    const { container } = render(<CommandLine command={command} />);
    const line = screen.getByRole('button', { name: command });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(line).toHaveTextContent(`$ ${command}`);
    await expectNoAxeViolations(container);

    await user.click(line);
    expect(line).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Enter}');
    expect(line).toHaveAttribute('aria-expanded', 'false');
    expect(line).toHaveFocus();
  });

  it('starts in full when told', () => {
    render(<CommandLine command="npm test -- agent-builder" defaultOpen />);
    expect(screen.getByRole('button', { name: 'npm test -- agent-builder' })).toHaveAttribute('aria-expanded', 'true');
  });
});
