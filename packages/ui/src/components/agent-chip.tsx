import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { sessionStateLabel, type SessionItemReady, type SessionItemState } from './session-item.tsx';

/** The sidebar's colours for each session state (`SessionItem`), so one state looks the same everywhere. */
const chipVariants = cva(
  'relative inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-label font-medium whitespace-nowrap no-underline after:absolute after:inset-x-0 after:-inset-y-1',
  {
    variants: {
      state: {
        needs_you: 'bg-warning-subtle text-warning',
        working: 'bg-info-subtle text-info-foreground',
        done: 'bg-success-subtle text-success',
        pr_open: 'bg-subtle text-muted-foreground',
        stopped: 'bg-subtle text-muted-foreground',
      },
    },
  },
);

export type AgentChipProps = Omit<ComponentProps<'a'>, 'children'> & {
  state: SessionItemState;
  /** What "Done" is ready for. */
  ready?: SessionItemReady;
  /** Render the child link (the router's) with the chip's dot and word inside it. */
  asChild?: boolean;
  children?: ComponentProps<'a'>['children'];
};

/**
 * Design system: agent chip (`dh-agent-chip`). Claude's state for a ticket ("Needs you"), linking to
 * its session. A dot and the sidebar's word for the state, in the sidebar's colours (spec 006 Q3d).
 * Drawn 24 px tall; its clickable area is 32 px (Q2b).
 */
export function AgentChip({ state, ready, asChild = false, className, children, ...props }: AgentChipProps) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp data-slot="agent-chip" className={cn(chipVariants({ state }), className)} {...props}>
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
      {sessionStateLabel(state, ready)}
    </Comp>
  );
}
