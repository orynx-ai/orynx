import type { Meta, StoryObj } from '@storybook/react-vite';
import { ExternalLink } from './external-link.tsx';

const meta = {
  title: 'Components/ExternalLink',
  component: ExternalLink,
  args: { href: 'https://your-team.atlassian.net/browse/PROJ-1423', onOpen: () => undefined, children: 'Open in Jira' },
} satisfies Meta<typeof ExternalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On its own, as the Ticket tab and Settings draw it: underlined and highlighted on hover. */
export const Standalone: Story = {};

/** At body size, as in the page bar. */
export const Body: Story = { args: { size: 'body' } };

/** In a sentence, as a ticket's description shows a link: underlined always. */
export const Inline: Story = {
  render: (args) => (
    <p className="m-0 max-w-md">
      Read{' '}
      <ExternalLink {...args} look="inline" size="inherit" href="https://figma.example.com/file/content-list">
        the design for the content list
      </ExternalLink>{' '}
      before you change the toolbar.
    </p>
  ),
};
