import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ListNav, ListNavItem, ListNavSkeleton } from './list-nav.tsx';
import { SearchField } from './search-field.tsx';

const skills = [
  {
    folder: 'bug-bash',
    label: 'Bug bash',
    tag: 'Used 4 times',
    description: 'Hunt for bugs in the code a ticket touches and list each one with steps to reproduce.',
  },
  {
    folder: 'how-we-review',
    label: 'How we review',
    tag: 'Used 12 times',
    description: 'Review a pull request the way our team does: correctness, tests, readability, then nits.',
  },
  {
    folder: 'write-tests-first',
    label: 'Write tests first',
    tag: 'Used 7 times',
    description: 'Write a failing test for each acceptance criterion before changing any code.',
  },
  {
    folder: 'explain-this-code',
    label: 'Explain this code',
    tag: 'Not used yet',
    description: 'Explain how a part of the codebase works, for someone new to it.',
  },
];

/** Settings › Skills' list (spec 023): pick a skill to open it beside the list. */
const meta = {
  title: 'Components/ListNav',
  component: ListNav,
  args: { 'aria-label': 'Your skills' },
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The design's four skills, Bug bash open; picking another opens it. */
export const Skills: Story = {
  render: (args) => {
    const [current, setCurrent] = useState('bug-bash');
    return (
      <ListNav {...args} search={<SearchField size="sm" aria-label="Search skills" placeholder="Search skills" />}>
        {skills.map((skill) => (
          <ListNavItem
            key={skill.folder}
            label={skill.label}
            tag={skill.tag}
            description={skill.description}
            current={skill.folder === current}
            onClick={() => {
              setCurrent(skill.folder);
            }}
          />
        ))}
      </ListNav>
    );
  },
};

/** A long name is cut to one line, a long description to two. */
export const LongText: Story = {
  render: (args) => (
    <ListNav {...args}>
      <ListNavItem
        label="Review a pull request the way the platform team does it on Fridays"
        tag="Used 120 times"
        description="Read the ticket and its acceptance criteria, then the diff, then every test that changed, then the files the diff calls into, and list what is wrong with each, from blocking to nit."
        current
      />
    </ListNav>
  ),
};

/** No item, as when a search matches nothing. */
export const Empty: Story = {
  args: {
    search: <SearchField size="sm" aria-label="Search skills" defaultValue="rev" />,
    empty: 'No skills match “rev”.',
  },
};

/** While the items load: rows the size of real ones. */
export const Loading: Story = {
  render: () => <ListNavSkeleton rows={3} />,
};
