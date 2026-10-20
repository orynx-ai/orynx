import type { Meta, StoryObj } from '@storybook/react-vite';
import { TerminalView, type TerminalScreen } from './terminal-view.tsx';

/** A shell's output as it arrives: the prompt in green, then what `git status` printed, then the prompt again. */
const session = [
  '\u001b[32m~/web-app\u001b[0m on \u001b[33mfeat/PROJ-1423\u001b[0m\r\n❯ git status\r\n',
  'On branch feat/PROJ-1423\r\nChanges not staged for commit:\r\n',
  '\u001b[31m\tmodified:   src/content-list.ts\u001b[0m\r\n\r\n',
  '\u001b[32m~/web-app\u001b[0m on \u001b[33mfeat/PROJ-1423\u001b[0m\r\n❯ ',
].join('');

/** Feeds the screen once, as the server's replay would; typing echoes back, as a shell's line would. */
function feedOnce(data: string) {
  let echo: TerminalScreen | null = null;
  return {
    connect: (screen: TerminalScreen) => {
      echo = screen;
      screen.reset(data);
      return () => {
        echo = null;
      };
    },
    onData: (typed: string) => {
      echo?.write(typed === '\r' ? '\r\n❯ ' : typed);
    },
  };
}

const meta = {
  title: 'Components/TerminalView',
  component: TerminalView,
  args: { label: 'zsh · worktree', onResize: () => undefined, ...feedOnce(session) },
  decorators: [
    (Story) => (
      <div className="flex h-80 flex-col border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TerminalView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithOutput: Story = { args: { className: 'flex-1' } };

export const Empty: Story = { args: { className: 'flex-1', ...feedOnce('') } };

export const Focused: Story = { args: { className: 'flex-1', takeFocus: true } };
