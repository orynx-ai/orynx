import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Home03Icon,
  PencilEdit02Icon,
  Search01Icon,
  Settings02Icon,
  Ticket01Icon,
} from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';

const meta = { title: 'Components/Icon', component: Icon, args: { icon: Home03Icon } } satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The sidebar's set and the arrows, in the text colour at 20 px. */
export const Set: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {[
        Home03Icon,
        Ticket01Icon,
        Settings02Icon,
        PencilEdit02Icon,
        Search01Icon,
        ArrowRight01Icon,
        ArrowDown01Icon,
      ].map((icon, index) => (
        <Icon key={index} icon={icon} />
      ))}
    </div>
  ),
};

/** Quieter, as a row's meta icons draw it. */
export const Muted: Story = { args: { className: 'text-muted-foreground' } };

/** Resized by its caller, as a ticked box's tick is. */
export const Small: Story = { args: { icon: ArrowDown01Icon, className: 'size-4' } };
