import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SaveError } from './save-error.tsx';

describe('SaveError', () => {
  it('AC-14: says the change was not saved and what to check, as an alert', () => {
    render(<SaveError />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      "Couldn't save that change. Check that Orynx is still running, then try again.",
    );
  });
});
