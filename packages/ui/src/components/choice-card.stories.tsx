import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChoiceCard } from './choice-card.tsx';
import { Pill } from './pill.tsx';

const meta = {
  title: 'Components/ChoiceCard',
  component: ChoiceCard,
  args: {
    name: 'method',
    value: 'gh',
    title: 'Use my gh login',
    detail: 'Orynx asks the gh command-line tool for your token each time and keeps no copy.',
  },
  decorators: [
    (Story) => (
      // Every radio needs a group name for axe; ChoiceGroup gives it one in real use.
      <fieldset className="m-0 max-w-md border-0 p-0">
        <legend className="sr-only">Connect with</legend>
        <Story />
      </fieldset>
    ),
  ],
} satisfies Meta<typeof ChoiceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const TitleOnly: Story = { args: { title: 'Match my computer', detail: undefined, defaultChecked: true } };
/** A pill beside the title, as Settings › Coding agent marks Balanced "Recommended". */
export const WithAside: Story = {
  args: {
    title: 'Balanced',
    detail: 'Edits freely, runs your allowed commands, asks for the rest.',
    aside: <Pill plain>Recommended</Pill>,
    defaultChecked: true,
  },
};
export const LongDetail: Story = {
  args: {
    title: 'Use a personal access token',
    detail:
      'Orynx keeps the token in your keychain. Create a classic token with the repo scope, and authorize it for single sign-on if your company uses it.',
  },
};
