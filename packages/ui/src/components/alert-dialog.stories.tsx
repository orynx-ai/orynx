import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog.tsx';
import { Button } from './button.tsx';

const meta = {
  title: 'Components/AlertDialog',
  component: AlertDialog,
  // Open from the start, so the story shows the confirmation; Cancel closes it and the button opens it again.
  args: { defaultOpen: true },
  decorators: [
    (Story) => (
      <div className="min-h-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

function Confirm({
  title,
  line,
  action,
  pending = false,
}: {
  title: string;
  line: string;
  action: string;
  pending?: boolean;
}) {
  return (
    <>
      <AlertDialogTrigger asChild>
        <Button variant="danger-ghost">{action}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogBody>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{line}</AlertDialogDescription>
        </AlertDialogBody>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction pending={pending}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </>
  );
}

/** Delete ticket (spec 037): Cancel focused first, the danger action last. */
export const Default: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <Confirm
        title="Delete ORX-3?"
        line="It’s gone for good, and its key isn’t used again. Sessions started from it keep their brief."
        action="Delete ticket"
      />
    </AlertDialog>
  ),
};

/** The action is working: it keeps its place and says so, and the confirmation stays open. */
export const Pending: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <Confirm
        title="Delete ORX-3?"
        line="It’s gone for good, and its key isn’t used again."
        action="Delete ticket"
        pending
      />
    </AlertDialog>
  ),
};

/** A long title wraps in the 520 px dialog; under 768 px the dialog fills the width less the gutter. */
export const LongTitle: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <Confirm
        title="Delete ORX-128 · Archive the content list's old items in bulk, with an undo toast that lasts ten seconds?"
        line="It’s gone for good, and its key isn’t used again."
        action="Delete ticket"
      />
    </AlertDialog>
  ),
};
