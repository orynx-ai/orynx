import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import {
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestClosedIcon,
  StopIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { Skeleton } from './skeleton.tsx';

export type SessionItemState = 'needs_you' | 'working' | 'done' | 'pr_open' | 'pr_merged' | 'pr_closed' | 'stopped';

/** The word for each state, from the product spec ("Session states"). */
export const sessionStateLabels: Record<SessionItemState, string> = {
  needs_you: 'Needs you',
  working: 'Working',
  done: 'Done, ready for PR',
  pr_open: 'PR open',
  pr_merged: 'PR merged',
  pr_closed: 'PR closed',
  stopped: 'Stopped',
};

/**
 * What a finished session is ready for, from what Claude did (spec 031): a pull request, a push to your pull
 * request's own branch, or nothing, after an Ask or a Build that edited no file.
 */
export type SessionItemReady = 'pull_request' | 'push' | 'nothing';

const doneLabels: Record<SessionItemReady, string> = {
  pull_request: sessionStateLabels.done,
  push: 'Done, ready to push',
  nothing: 'Done',
};

/** The state's word; "Done" says what the session is ready for. */
export function sessionStateLabel(state: SessionItemState, ready: SessionItemReady = 'pull_request'): string {
  return state === 'done' ? doneLabels[ready] : sessionStateLabels[state];
}

const iconVariants = cva('inline-flex shrink-0 items-center justify-center rounded-full', {
  variants: {
    // The small row's 20 px circle holds 12 px glyphs (spec 039, Q4).
    size: { default: 'size-6', sm: 'size-5 [&_svg]:size-3' },
    state: {
      needs_you: 'bg-warning-subtle text-warning',
      working: 'bg-info-subtle text-info-foreground',
      done: 'bg-success-subtle text-success',
      pr_open: 'bg-subtle text-muted-foreground',
      // Merged has no purple token (spec 047, Q1): Done's green, with the merge glyph.
      pr_merged: 'bg-success-subtle text-success',
      pr_closed: 'bg-subtle text-muted-foreground',
      stopped: 'bg-subtle text-muted-foreground',
    },
  },
});

// The state word never shrinks: a long source truncates first, so the state is always readable.
const wordVariants = cva('shrink-0 font-medium', {
  variants: {
    state: {
      needs_you: 'text-warning',
      working: 'text-info-foreground',
      done: 'text-success',
      pr_open: 'text-muted-foreground',
      pr_merged: 'text-success',
      pr_closed: 'text-muted-foreground',
      stopped: 'text-muted-foreground',
    },
  },
});

/** 14 px glyphs inside the 24 px circle, on the first line (components.css `.dh-session-icon`, scaled up). */
const glyph = 'size-3.5 stroke-2';

/** The "!" and the open arc are drawn by the design itself; Lucide has no bare versions of them. */
function DesignGlyph({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('lucide', glyph, className)}
    >
      {children}
    </svg>
  );
}

const icons: Record<SessionItemState, ReactNode> = {
  needs_you: (
    <DesignGlyph>
      <path d="M12 7v6" />
      <path d="M12 17h.01" />
    </DesignGlyph>
  ),
  working: (
    <DesignGlyph className="motion-safe:animate-spin">
      <path d="M21 12a9 9 0 1 1-9-9" />
    </DesignGlyph>
  ),
  done: <Icon icon={Tick02Icon} className={glyph} />,
  pr_open: <Icon icon={GitBranchIcon} className={glyph} />,
  pr_merged: <Icon icon={GitMergeIcon} className={glyph} />,
  pr_closed: <Icon icon={GitPullRequestClosedIcon} className={glyph} />,
  stopped: <Icon icon={StopIcon} className={glyph} />,
};

/** The state's 24 px circle with its glyph, as the sidebar draws it. For the eye only: say the state in words too. */
export function SessionStateIcon({
  state,
  size = 'default',
  className,
}: {
  state: SessionItemState;
  size?: SessionItemSize;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn(iconVariants({ state, size }), className)}>
      {icons[state]}
    </span>
  );
}

/** `sm` is the sidebar's (spec 039, Q4): a 14 px title over a 12 px line, and a 20 px circle. */
export type SessionItemSize = 'default' | 'sm';

const rowVariants = cva(
  'flex items-start rounded-sm text-foreground no-underline hover:bg-subtle aria-[current=page]:bg-raised aria-[current=page]:ring-1 aria-[current=page]:ring-border',
  { variants: { size: { default: 'gap-3 px-3 py-2', sm: 'gap-2.5 px-2.5 py-1.5' } } },
);

export type SessionItemProps = Omit<ComponentProps<'a'>, 'title'> & {
  title: string;
  /** What the session was started from, for example `PROJ-1423` or `PR #2836`. */
  source?: string | undefined;
  state: SessionItemState;
  /** What "Done" is ready for. */
  ready?: SessionItemReady;
  /** Render the child element (for example a router link) as the row. */
  asChild?: boolean;
  size?: SessionItemSize;
  /**
   * Buttons at the row's end, such as its ⋯ menu (spec 039): beside the link, never inside it. They show while the
   * pointer is over the row, something in it has focus or its menu is open, and always under 768 px (no hover).
   */
  actions?: ReactNode;
};

/**
 * Design system: SidebarNav session (`dh-session`). A two-line link: the title, then the
 * source and the state. The state is told three ways: icon shape, word and colour.
 * Mark the open session with `aria-current="page"`.
 */
export function SessionItem({
  title,
  source,
  state,
  ready,
  asChild = false,
  size = 'default',
  actions,
  className,
  children,
  ...props
}: SessionItemProps) {
  const Comp = asChild ? Slot.Root : 'a';
  const small = size === 'sm';
  const row = (
    <Comp
      className={cn(
        rowVariants({ size }),
        // Room for the actions while they show, so the title is cut short before them rather than under them.
        actions !== undefined &&
          // style-policy-ignore-next-line: a state variant, not a value; the menu's open trigger keeps the room
          'group-focus-within/session:pe-10 group-hover/session:pe-10 group-has-data-[state=open]/session:pe-10 max-md:pe-10',
        className,
      )}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      <SessionStateIcon state={state} size={size} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        {/* The spaces keep the link's name readable ("Add bulk archive PROJ-1423 Needs you"); flex drops them visually.
            The tooltip shows a title the row cuts short; the link's name still comes from the text. */}
        <span className={cn('truncate font-medium', small && 'text-small')} title={title}>
          {title}
        </span>{' '}
        <span
          className={cn(
            'flex items-center gap-1 overflow-hidden whitespace-nowrap text-muted-foreground',
            small ? 'text-label' : 'text-small',
          )}
        >
          {source === undefined ? null : (
            <>
              <span className="min-w-0 truncate font-mono">{source}</span>{' '}
              <span aria-hidden className="shrink-0">
                ·
              </span>{' '}
            </>
          )}
          <span className={wordVariants({ state })}>{sessionStateLabel(state, ready)}</span>
        </span>
      </span>
    </Comp>
  );
  if (actions === undefined) return row;
  return (
    <div className="group/session relative">
      {row}
      <div className="absolute inset-y-0 end-1 flex items-center opacity-0 group-focus-within/session:opacity-100 group-hover/session:opacity-100 has-data-[state=open]:opacity-100 max-md:opacity-100">
        {actions}
      </div>
    </div>
  );
}

/**
 * A session row while it loads: the row's own padding, its state circle and its two lines as blank
 * blocks, so nothing moves when the session arrives (spec 020: the sidebar's next 16).
 */
export function SessionItemSkeleton({
  size = 'default',
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { size?: SessionItemSize }) {
  const small = size === 'sm';
  return (
    <div
      data-slot="session-item-skeleton"
      aria-hidden
      className={cn(small ? 'flex items-start gap-2.5 px-2.5 py-1.5' : 'flex items-start gap-3 px-3 py-2', className)}
      {...props}
    >
      <Skeleton shape="circle" className={small ? 'size-5' : 'size-6'} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={cn('flex items-center', small ? 'h-5' : 'h-6')}>
          <Skeleton className={cn('w-3/4', small ? 'h-3.5' : 'h-4')} />
        </span>
        <span className={cn('flex items-center', small ? 'h-4' : 'h-5')}>
          <Skeleton className={cn('w-1/2', small ? 'h-3' : 'h-3.5')} />
        </span>
      </span>
    </div>
  );
}
