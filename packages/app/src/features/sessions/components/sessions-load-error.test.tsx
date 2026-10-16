import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '@devhub/ui/testing';
import { SessionsLoadError } from './sessions-load-error.tsx';

describe('SessionsLoadError', () => {
  it('AC-12: says the sessions could not load and offers to try again', async () => {
    const onRetry = vi.fn();
    const { container } = render(<SessionsLoadError onRetry={onRetry} />);

    expect(screen.getByText("Couldn't load sessions")).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetry).toHaveBeenCalledOnce();
    await expectNoAxeViolations(container);
  });
});
