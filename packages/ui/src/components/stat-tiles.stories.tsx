import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatTiles } from './stat-tiles.tsx';

const meta = {
  title: 'Components/StatTiles',
  component: StatTiles,
  args: {
    items: [
      { term: 'Last good sync', detail: '10:41' },
      { term: 'Next sync', detail: '10:43' },
      { term: 'Changes today', detail: '14' },
      { term: 'Success, last 2 h', detail: '58 of 60' },
    ],
  },
} satisfies Meta<typeof StatTiles>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Four tiles: one row on a wide pane, two rows of two on a narrow one. */
export const Default: Story = {};
export const Two: Story = {
  args: {
    items: [
      { term: 'Last good sync', detail: '09:40' },
      { term: 'Next sync', detail: '10:46' },
    ],
  },
};
