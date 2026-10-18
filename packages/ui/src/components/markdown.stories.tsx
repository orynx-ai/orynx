import type { Meta, StoryObj } from '@storybook/react-vite';
import { Markdown } from './markdown.tsx';

const meta = {
  title: 'Components/Markdown',
  component: Markdown,
  args: { onOpenLink: () => undefined, text: '' },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Ticket tab's description, as session.html draws it (spec 013, Q7). */
export const Description: Story = {
  args: {
    text: [
      'Content managers need to archive many items at once from the content list instead of one by one.',
      '',
      '### Acceptance criteria',
      '',
      '- Checkbox on each row, plus select all',
      '- Archive selected button in the toolbar',
      '- Partial failures show which items failed',
      '- Unit tests for the new API call',
    ].join('\n'),
  },
};

/** Every block and mark the Jira converter writes. */
export const EveryBlock: Story = {
  args: {
    text: [
      '## Background',
      '',
      'Call `bulkArchive()` **once per page**, *not per row*, and ~~never from the toolbar~~.',
      'A second line in the same paragraph.',
      '',
      '1. First step',
      '2. Second step',
      '   - a detail under it',
      '',
      '- [x] Row selection',
      '- [ ] The toolbar button',
      '',
      '> Said in the planning call: keep the old archive path working.',
      '',
      '---',
      '',
      '```ts',
      'export const archive = (ids: string[]) => api.post("/archive", { ids });',
      '```',
    ].join('\n'),
  },
};

/** Only http and https links are links; any other shows as its text (AC-10). */
export const Links: Story = {
  args: {
    text: 'See [the design](https://figma.example.com/file/content-list), or [this](javascript:alert(1)) which stays text.',
  },
};

/** A wide code block and table scroll inside their boxes, never the page (AC-10). */
export const WideContent: Story = {
  args: {
    text: [
      '```',
      'const columns = ["title", "owner", "status", "updated", "archived", "visibility", "audience", "translations", "tags"];',
      '```',
      '',
      '| Column | Shown to | Sorted by default | Can be archived | Notes for the content team |',
      '| --- | --- | --- | --- | --- |',
      '| Title | Everyone | Yes | Yes | The full title, never shortened in the list |',
      '| Owner | Admins | No | No | Falls back to the creator \\| when no owner is set |',
    ].join('\n'),
  },
};

/** HTML in a description shows as text, and nothing runs (AC-10). */
export const Html: Story = {
  args: { text: 'A description that holds <b>HTML</b> and <img src=x onerror="alert(1)">, shown as it is.' },
};
