import type { ComponentProps } from 'react';
import { Plug01Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { Icon, type IconSvgElement } from './icon.tsx';
import { Tooltip } from './tooltip.tsx';

/** A tool's connection, as Settings › Connections shows it (spec 030). */
export type StatusButtonState = 'connected' | 'needs_reconnecting' | 'not_connected';

// Each state has its own shape as well as its colour, so colour is never the only signal.
const icons: Record<StatusButtonState, IconSvgElement> = {
  connected: Tick02Icon,
  needs_reconnecting: RefreshIcon,
  not_connected: Plug01Icon,
};

const lookVariants = cva('inline-flex shrink-0 items-center justify-center rounded-full border', {
  variants: {
    state: {
      connected: 'border-transparent bg-success-subtle text-success',
      needs_reconnecting: 'border-transparent bg-warning-subtle text-warning',
      not_connected: 'border-dashed border-control bg-raised text-muted-foreground',
    },
  },
});

export type StatusButtonProps = ComponentProps<'button'> & {
  state: StatusButtonState;
  /** What pressing does, in the tooltip: "Connected · select to manage". */
  label: string;
  /** The tool and its state, which the tooltip alone doesn't say: "Jira: Connected. Manage connection". */
  'aria-label': string;
};

/**
 * Design system: status button (`dh-status-btn`, spec 030). A round 36 px button whose look says a tool's
 * connection: a green check, an amber circular arrow, or a dashed plug. It opens the tool's dialog, so it
 * is usually a `DialogTrigger`'s child.
 */
export function StatusButton({ state, label, className, ...props }: StatusButtonProps) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={cn(lookVariants({ state }), 'size-9 cursor-pointer p-0 hover:ring-3 hover:ring-subtle', className)}
        {...props}
      >
        <Icon icon={icons[state]} />
      </button>
    </Tooltip>
  );
}

/** The status button's look at 20 px, for the key under the list. A picture only: put the words beside it. */
export function StatusSign({ state, className }: { state: StatusButtonState; className?: string }) {
  return (
    <span aria-hidden className={cn(lookVariants({ state }), 'size-5', className)}>
      <Icon icon={icons[state]} className="size-3" />
    </span>
  );
}
