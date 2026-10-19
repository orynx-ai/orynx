import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { CopyButton } from './copy-button.tsx';

afterEach(() => {
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('copies its text, says "Copied" in its tooltip and name, then goes back after 2 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
    const { container } = render(<CopyButton text="src/content/ContentList.tsx" />);

    const button = screen.getByRole('button', { name: 'Copy src/content/ContentList.tsx' });
    await user.hover(button);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy path');
    await expectNoAxeViolations(container);

    await user.click(button);
    expect(await navigator.clipboard.readText()).toBe('src/content/ContentList.tsx');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);
    expect(await screen.findByRole('button', { name: 'Copy src/content/ContentList.tsx' })).toBeInTheDocument();
  });
});
