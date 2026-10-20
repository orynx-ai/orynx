import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Avatar } from './avatar.tsx';

describe('Avatar', () => {
  it('names the person for screen readers when a label is given', () => {
    render(<Avatar initials="RD" label="Assigned to you" />);
    expect(screen.getByRole('img', { name: 'Assigned to you' })).toHaveTextContent('RD');
  });

  it('is hidden from screen readers when the name is already shown next to it', () => {
    render(<Avatar initials="RD" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('RD')).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the picture in place of the initials, still named by its label', () => {
    render(<Avatar initials="RD" src="data:image/png;base64,AAAA" label="Rakesh D." />);
    const avatar = screen.getByRole('img', { name: 'Rakesh D.' });
    expect(avatar).not.toHaveTextContent('RD');
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Avatar initials="RD" label="Rakesh D." />);
    await expectNoAxeViolations(container);
  });
});
