import type { Meta, StoryObj } from '@storybook/react-vite';
import { Field } from './field.tsx';
import { Input } from './input.tsx';

const meta = {
  title: 'Components/Field',
  component: Field,
  args: {
    label: 'Jira site',
    help: 'The address you open Jira at, like your-team.atlassian.net.',
    children: <Input />,
  },
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithHelp: Story = {};
export const Filled: Story = { args: { children: <Input defaultValue="your-team.atlassian.net" /> } };
export const WithError: Story = {
  args: {
    error: 'Use your Jira Cloud address, like your-team.atlassian.net.',
    children: <Input defaultValue="your-team.atlasian.net" />,
  },
};
export const Secret: Story = {
  args: {
    label: 'API token',
    help: (
      <>
        Create one in your Atlassian account settings.{' '}
        <a className="text-info underline" href="https://id.atlassian.com/manage-profile/security/api-tokens">
          Create an API token
        </a>
      </>
    ),
    children: <Input type="password" autoComplete="off" />,
  },
};
export const LongError: Story = {
  args: {
    label: 'API token',
    error: "Jira didn't accept this email and API token. Check both, or create a new token.",
    children: <Input type="password" autoComplete="off" defaultValue="fake-token" />,
  },
};
export const WithoutHelp: Story = { args: { help: undefined } };
export const Disabled: Story = { args: { children: <Input disabled defaultValue="your-team.atlassian.net" /> } };
