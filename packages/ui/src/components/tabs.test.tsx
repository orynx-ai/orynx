import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoAxeViolations } from '../testing.ts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs.tsx';

function InboxTabs() {
  return (
    <Tabs defaultValue="all">
      <TabsList aria-label="Inbox sources">
        <TabsTrigger value="all" count={14}>
          All
        </TabsTrigger>
        <TabsTrigger value="jira" count={5}>
          Jira
        </TabsTrigger>
      </TabsList>
      <TabsContent value="all">Everything</TabsContent>
      <TabsContent value="jira">Only Jira</TabsContent>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('shows the selected tab with its count', () => {
    render(<InboxTabs />);
    expect(screen.getByRole('tab', { name: 'All 14' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Everything');
  });

  it('Q11d: keeps the room of a count still on its way, and says nothing of it', async () => {
    const { container } = render(
      <Tabs defaultValue="all">
        <TabsList aria-label="Inbox sources">
          <TabsTrigger value="all" count={null}>
            All
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">Everything</TabsContent>
      </Tabs>,
    );

    const tab = screen.getByRole('tab', { name: 'All' });
    expect(tab).toHaveTextContent(/^All$/);
    expect(tab.querySelector('[aria-hidden="true"]')).not.toBeNull();
    await expectNoAxeViolations(container);
  });

  it('switches content on click', async () => {
    render(<InboxTabs />);

    await userEvent.click(screen.getByRole('tab', { name: 'Jira 5' }));

    expect(screen.getByRole('tab', { name: 'Jira 5' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Only Jira');
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<InboxTabs />);
    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'All 14' })).toHaveFocus();

    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Jira 5' })).toHaveFocus();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<InboxTabs />);
    await expectNoAxeViolations(container);
  });
});
