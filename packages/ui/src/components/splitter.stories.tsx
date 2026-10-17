import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Splitter, type SplitterProps } from './splitter.tsx';

/** A sidebar-like panel with the handle over its right edge, the way the app uses it. */
function ResizablePanel(args: SplitterProps) {
  const [width, setWidth] = useState(args.value);
  return (
    <div className="flex h-60 bg-canvas">
      <aside
        id="story-panel"
        className="relative shrink-0 border-r border-border bg-sidebar p-3 text-small text-muted-foreground"
        style={{ width }}
      >
        {width} px
        <Splitter {...args} value={width} onValueChange={setWidth} className="absolute inset-y-0 -right-1.5" />
      </aside>
      <main className="flex-1 p-3 text-small">Content</main>
    </div>
  );
}

const meta = {
  title: 'Components/Splitter',
  component: Splitter,
  args: {
    'aria-label': 'Resize sidebar',
    'aria-controls': 'story-panel',
    value: 260,
    min: 260,
    max: 400,
    defaultValue: 260,
    onValueChange: () => undefined,
  },
  render: (args) => <ResizablePanel {...args} />,
} satisfies Meta<typeof Splitter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AtMinimum: Story = {};
export const InBetween: Story = { args: { value: 320 } };
export const AtMaximum: Story = { args: { value: 400 } };
