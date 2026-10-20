import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './avatar.tsx';

const meta = { title: 'Components/Avatar', component: Avatar, args: { initials: 'RD' } } satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { label: 'Assigned to you' } };
export const Large: Story = { args: { size: 'lg' } };
export const Decorative: Story = {};
export const ExtraLarge: Story = { args: { size: 'xl' } };
/** A picture the person added, in place of the initials. */
export const Picture: Story = {
  args: {
    size: 'xl',
    src: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"%3E%3Crect width="1" height="1" fill="%23888"/%3E%3C/svg%3E',
  },
};
/** 96 px, centred at the top of Edit profile and Set up Orynx. */
export const Profile: Story = { args: { size: '2xl', initials: 'AL' } };
