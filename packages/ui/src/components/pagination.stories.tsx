import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Pagination } from './pagination.tsx';

const meta = {
  title: 'Components/Pagination',
  component: Pagination,
  args: {
    page: 2,
    pageCount: 3,
    pageLink: (page: number, children: ReactNode) => <a href={`#page-${String(page)}`}>{children}</a>,
  },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A few pages: every number shows. */
export const FewPages: Story = {};
/** The first page: Previous is unavailable. */
export const FirstPage: Story = { args: { page: 1 } };
/** The last page: Next is unavailable. */
export const LastPage: Story = { args: { page: 3 } };
/** 19 pages, on page 10: the first, the last and the pages around the current one. */
export const ManyPages: Story = { args: { page: 10, pageCount: 19 } };
/** 19 pages, on page 2: the first five stay, so the pager keeps its width. */
export const NearTheStart: Story = { args: { page: 2, pageCount: 19 } };
/** Under 480 px wide: arrows only for Previous and Next, and only the pages around the current one. */
export const Narrow: Story = {
  args: { page: 1, pageCount: 7 },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
};
