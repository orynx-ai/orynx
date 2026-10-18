import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from './dialog.tsx';

const meta = {
  title: 'Components/Dialog',
  component: Dialog,
  // Open from the start, so the story shows the dialog; Esc closes it and the button opens it again.
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <div className="min-h-96">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A title and a line: as tall as its content, 80 px from the top (16 px under 768 px). */
export const Default: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button>Open the dialog</Button>
      </DialogTrigger>
      <DialogContent className="gap-2 p-4">
        <DialogTitle>Search</DialogTitle>
        <p className="text-muted-foreground">
          Find a ticket by key or title, a pull request by number or repository, or a session.
        </p>
      </DialogContent>
    </Dialog>
  ),
};

/** More than the window holds: the dialog stops 80 px above the bottom, and only its body scrolls. */
export const TallerThanTheWindow: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger asChild>
        <Button>Open the dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="border-b border-border p-4">Search</DialogTitle>
        <ul aria-label="Results" className="min-h-0 overflow-y-auto p-1.5">
          {Array.from({ length: 40 }, (_, index) => (
            <li key={index} className="flex min-h-10 items-center px-2">
              Result {index + 1}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  ),
};
