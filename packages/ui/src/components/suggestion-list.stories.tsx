import type { Meta, StoryObj } from '@storybook/react-vite';
import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import { Icon } from './icon.tsx';
import { SuggestionList } from './suggestion-list.tsx';

const mark = <Icon icon={BookOpen01Icon} className="text-muted-foreground" />;

const meta = {
  title: 'Components/SuggestionList',
  component: SuggestionList,
  args: {
    listId: 'skills',
    label: 'Skills',
    activeId: 'skill-review',
    onPick: () => undefined,
    options: [
      { id: 'skill-build', mark, code: '/build', title: 'Do the next unchecked task of a spec', meta: 'web-app' },
      { id: 'skill-review', mark, code: '/review', title: 'Review the whole branch', meta: 'web-app' },
      { id: 'skill-notes', mark, code: '/notes', title: '', meta: 'Yours' },
    ],
  },
  decorators: [
    (Story) => (
      <div className="max-w-xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SuggestionList>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Typing `/`: the skills, the active one marked. */
export const Ready: Story = {};
/** Read for the first time: three rows the size of real ones. */
export const Loading: Story = { args: { loading: true, options: [] } };
/** No skills in the folder or yours. */
export const Empty: Story = { args: { options: [], activeId: null, notice: 'No skills in web-app or in ~/.claude.' } };
/** The read failed: one line, and typing goes on as text. */
export const Failed: Story = { args: { options: [], activeId: null, notice: "Orynx couldn't read the skills." } };
/** A description longer than the row is cut off; its tooltip shows it whole. */
export const LongText: Story = {
  args: {
    options: [
      {
        id: 'skill-long',
        mark,
        code: '/release:notes-for-the-quarter',
        title: 'Write the release notes for every change merged since the last tag, grouped by area, in plain words',
        meta: 'web-app',
      },
    ],
    activeId: 'skill-long',
  },
};
