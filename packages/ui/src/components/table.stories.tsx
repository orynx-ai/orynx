import type { Meta, StoryObj } from '@storybook/react-vite';
import { AgentChip } from './agent-chip.tsx';
import { Pill } from './pill.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableRowSkeleton } from './table.tsx';
import { WorkItemKey, WorkItemPriority, WorkItemTitle } from './work-item-card.tsx';

/** The Tickets list: the sprint as a table, scrolling sideways inside its box when the window is narrow. */
const meta = {
  title: 'Components/Table',
  component: Table,
  args: { caption: 'Tickets in Sprint 42', className: 'min-w-190', children: null },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

function Head() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Key</TableHead>
        <TableHead>Title</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Priority</TableHead>
        <TableHead>Due</TableHead>
        <TableHead>
          <span className="sr-only">Agent</span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
}

export const Tickets: Story = {
  render: (args) => (
    <Table {...args}>
      <Head />
      <TableBody>
        <TableRow>
          <TableCell>
            <WorkItemKey>PROJ-1377</WorkItemKey>
          </TableCell>
          <TableCell>
            <WorkItemTitle href="#">Search returns archived sites for guest users</WorkItemTitle>
          </TableCell>
          <TableCell>
            <Pill>To Do</Pill>
          </TableCell>
          <TableCell>
            <WorkItemPriority level="high" label="High" />
          </TableCell>
          <TableCell>Mon</TableCell>
          <TableCell />
        </TableRow>
        <TableRow>
          <TableCell>
            <WorkItemKey>PROJ-1423</WorkItemKey>
          </TableCell>
          <TableCell>
            <WorkItemTitle href="#">Add bulk archive to the content list</WorkItemTitle>
          </TableCell>
          <TableCell>
            <Pill tone="warning">In Progress</Pill>
          </TableCell>
          <TableCell>
            <WorkItemPriority level="high" label="High" />
          </TableCell>
          <TableCell>Fri</TableCell>
          <TableCell className="text-end">
            <AgentChip state="needs_you" href="#" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const Loading: Story = {
  render: (args) => (
    <Table {...args} aria-busy>
      <Head />
      <TableBody>
        <TableRowSkeleton columns={6} />
        <TableRowSkeleton columns={6} />
        <TableRowSkeleton columns={6} />
      </TableBody>
    </Table>
  ),
};
