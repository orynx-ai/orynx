import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from './breadcrumb.tsx';

function TicketCrumbs() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/tickets">Tickets</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>PROJ-1423</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

describe('Breadcrumb', () => {
  it('is a labelled navigation landmark', () => {
    render(<TicketCrumbs />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
  });

  it('links to the place and marks the current page without a link', () => {
    render(<TicketCrumbs />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(within(nav).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets');
    expect(within(nav).getByText('PROJ-1423')).toHaveAttribute('aria-current', 'page');
    expect(within(nav).queryByRole('link', { name: 'PROJ-1423' })).toBeNull();
  });

  it('hides the separators from screen readers', () => {
    render(<TicketCrumbs />);
    expect(screen.getByText('/')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<TicketCrumbs />);
    await expectNoAxeViolations(container);
  });
});
