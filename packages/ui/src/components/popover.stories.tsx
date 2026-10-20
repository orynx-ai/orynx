import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { Popover, PopoverContent, PopoverTrigger } from './popover.tsx';

const meta = {
  title: 'Components/Popover',
  component: Popover,
  // Open from the start, so the story shows the panel; Esc closes it and the button opens it again.
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <div className="min-h-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A panel under its trigger, lined up with its start, drawn as a menu is. */
export const Default: Story = {
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger asChild>
        <Button>Due date</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Due date" className="flex w-64 flex-col gap-2">
        <p className="m-0 text-muted-foreground">Pick the day this ticket is due.</p>
        <Button size="sm" variant="ghost" className="self-start">
          Clear date
        </Button>
      </PopoverContent>
    </Popover>
  ),
};
