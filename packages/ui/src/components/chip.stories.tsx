import type { Meta, StoryObj } from '@storybook/react-vite';
import { GitPullRequestIcon, KanbanIcon, Message01Icon, Wrench01Icon } from '@hugeicons/core-free-icons';
import { Chip, FilterChip } from './chip.tsx';
import { Icon } from './icon.tsx';

const meta = {
  title: 'Components/Chip',
  component: Chip,
  args: { children: 'Draft a Slack reply' },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Home's quick starts: links that go somewhere and buttons that act, centred and wrapping. */
export const QuickStarts: Story = {
  render: () => (
    <div className="flex max-w-xl flex-wrap justify-center gap-2">
      <Chip asChild>
        <a href="#tickets">
          <Icon icon={KanbanIcon} aria-hidden />
          Pick up a ticket
        </a>
      </Chip>
      <Chip>
        <Icon icon={GitPullRequestIcon} aria-hidden />
        Review a pull request
      </Chip>
      <Chip asChild>
        <a href="#session">
          <Icon icon={Wrench01Icon} aria-hidden />
          Fix failing checks
        </a>
      </Chip>
      <Chip>
        <Icon icon={Message01Icon} aria-hidden />
        Draft a Slack reply
      </Chip>
    </div>
  ),
};

/** Tickets' toolbar: filters that are on or off. */
export const Filters: Story = {
  render: () => (
    <div role="group" aria-label="Filters" className="flex flex-wrap items-center gap-2">
      <FilterChip defaultPressed>Assigned to me</FilterChip>
      <FilterChip>Due this week</FilterChip>
      <FilterChip>Bugs only</FilterChip>
    </div>
  ),
};
