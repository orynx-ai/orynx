import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert02Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Button } from './button.tsx';
import { Toast, ToastRegion } from './toast.tsx';

const meta = {
  title: 'Components/Toast',
  component: Toast,
  args: {
    icon: CheckmarkCircle02Icon,
    tone: 'success',
    role: 'status',
    title: 'Session finished, ready for a pull request',
    detail: 'PROJ-1398 · Read receipts on analytics',
    onOpen: () => undefined,
    onClose: () => undefined,
  },
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="h-80">
        <ToastRegion>
          <Story />
        </ToastRegion>
      </div>
    ),
  ],
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Finished: Story = {};
export const WaitingForApproval: Story = {
  args: {
    icon: Alert02Icon,
    tone: 'warning',
    role: 'alert',
    title: 'Claude wants to run a command',
    detail: 'PROJ-1423 · Add bulk archive · npm test -- content-list',
    actions: (
      <>
        <Button size="sm" variant="secondary">
          Allow once
        </Button>
        <Button size="sm" variant="ghost">
          Review
        </Button>
      </>
    ),
  },
};
export const Failed: Story = {
  args: { icon: Alert02Icon, tone: 'danger', title: 'Session failed', detail: 'PROJ-1377 · Fix the export' },
};
export const LongText: Story = {
  args: {
    title: 'Session finished, ready for a pull request on a ticket whose title runs very long indeed',
    detail: 'PROJ-1398 · Read receipts on analytics, with a title long enough to wrap onto a second line',
  },
};
