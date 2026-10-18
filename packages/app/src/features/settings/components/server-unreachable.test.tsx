import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServerUnreachable } from './server-unreachable.tsx';

describe('ServerUnreachable', () => {
  it('AC-16: says the server is out of reach and what to do, as an alert', () => {
    render(<ServerUnreachable />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not reach the Orynx server');
    expect(alert).toHaveTextContent('Check that Orynx is still running in your terminal, then reload the page.');
  });
});
