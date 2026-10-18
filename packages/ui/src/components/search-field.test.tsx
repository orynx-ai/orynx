import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { SearchField } from './search-field.tsx';

function TicketSearch() {
  const [text, setText] = useState('');
  return (
    <>
      <SearchField
        aria-label="Search tickets"
        placeholder="Search tickets"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <output>{text}</output>
    </>
  );
}

describe('SearchField', () => {
  it('Q10b: is a search box named for screen readers, with its magnifier hidden from them', async () => {
    const { container } = render(<TicketSearch />);

    const box = screen.getByRole('searchbox', { name: 'Search tickets' });
    expect(box).toHaveAttribute('placeholder', 'Search tickets');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    await expectNoAxeViolations(container);
  });

  it('Q10b: takes what is typed', async () => {
    const user = userEvent.setup();
    render(<TicketSearch />);

    await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'archive');

    expect(screen.getByRole('status')).toHaveTextContent('archive');
  });

  it('Q10b: sizes the whole field, magnifier included, from its className', () => {
    render(<SearchField aria-label="Search" className="w-60" />);

    const box = screen.getByRole('searchbox', { name: 'Search' });
    expect(box.parentElement).toHaveClass('w-60');
    expect(box).not.toHaveClass('w-60');
  });
});
