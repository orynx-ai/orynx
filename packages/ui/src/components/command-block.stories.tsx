import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button.tsx';
import { CommandBlock } from './command-block.tsx';
import { Pill } from './pill.tsx';

const meta = {
  title: 'Components/CommandBlock',
  component: CommandBlock,
  args: {
    command: 'git status',
    status: '✓ 0.1s',
    tone: 'success',
    output: ['On branch feat/PROJ-1423', 'Changes not staged for commit:', '  modified:   src/content/ContentList.tsx'],
  },
} satisfies Meta<typeof CommandBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Done: Story = {
  args: {
    actions: (
      <>
        <Button size="sm" variant="secondary">
          Rerun
        </Button>
        <Button size="sm" variant="secondary">
          Copy
        </Button>
      </>
    ),
  },
};

export const Failed: Story = {
  args: {
    command: 'npm test -- content-list',
    status: '✗ exit 1 · 3.1s',
    tone: 'danger',
    output: [
      ' FAIL  src/content/__tests__/bulkArchive.test.ts',
      '  ● bulk archive › returns 207 when some items fail',
      '    Expected status: 207',
      '    Received status: 200',
      'Tests: 1 failed, 23 passed, 24 total',
    ],
    actions: (
      <>
        <Button size="sm" variant="secondary">
          Ask Claude to fix
        </Button>
        <Button size="sm" variant="secondary">
          Rerun
        </Button>
      </>
    ),
  },
};

export const Running: Story = {
  args: {
    command: 'npm run dev',
    status: '● running',
    tone: 'warning',
    output: ['  VITE v5.4.8  ready in 412 ms', '  ➜  Local:   http://localhost:5173/'],
    actions: (
      <Button size="sm" variant="secondary">
        Stop
      </Button>
    ),
  },
};

export const ClaudesCommand: Story = {
  args: { command: 'npm run lint', badge: <Pill tone="info">Claude</Pill>, status: '✓ 1.8s', output: ['✓ 0 problems'] },
};

export const WaitingForYou: Story = {
  args: {
    command: 'npm install date-fns@3.6.0',
    badge: <Pill tone="info">Claude</Pill>,
    status: '● waiting for you',
    tone: 'warning',
    output: undefined,
    children: (
      <>
        <span className="flex-1 basis-64 text-warning">Claude wants to run this. It uses the network.</span>
        <Button size="sm" variant="secondary">
          Allow once
        </Button>
        <Button size="sm" variant="secondary">
          Deny
        </Button>
      </>
    ),
  },
};

export const Denied: Story = {
  args: { command: 'git push --force', status: 'denied', tone: 'neutral', output: undefined },
};

export const LongCommandAndCutOutput: Story = {
  args: {
    command: 'pnpm --filter @devhub/app test -- --run src/features/sessions/components/terminal/shell-tab.test.tsx',
    note: 'Showing the last 2,000 lines.',
    output: Array.from({ length: 6 }, (_, line) => `line ${String(1995 + line)} ${'x'.repeat(120)}`),
  },
};
