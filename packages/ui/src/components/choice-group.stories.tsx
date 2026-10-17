import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChoiceCard } from './choice-card.tsx';
import { ChoiceGroup } from './choice-group.tsx';

const ways = (
  <>
    <ChoiceCard
      name="method"
      value="gh"
      title="Use my gh login"
      detail="DevHub asks the gh command-line tool for your token each time and keeps no copy."
      defaultChecked
    />
    <ChoiceCard
      name="method"
      value="token"
      title="Use a personal access token"
      detail="DevHub keeps the token in your keychain."
    />
  </>
);

const meta = {
  title: 'Components/ChoiceGroup',
  component: ChoiceGroup,
  args: { legend: 'Connect with', children: ways },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChoiceGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithDetails: Story = {};
export const TitlesOnly: Story = {
  args: {
    legend: 'Theme',
    children: (
      <>
        <ChoiceCard name="theme" value="system" title="Match my computer" defaultChecked />
        <ChoiceCard name="theme" value="light" title="Light" />
        <ChoiceCard name="theme" value="dark" title="Dark" />
      </>
    ),
  },
};
export const WithHelp: Story = { args: { help: 'You can switch later from Manage.' } };
export const WithError: Story = {
  args: { error: "gh isn't signed in to github.com. Run gh auth login in a terminal, then try again." },
};
