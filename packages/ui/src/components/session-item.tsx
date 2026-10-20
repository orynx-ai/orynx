import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { GitBranchIcon, StopIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { Skeleton } from './skeleton.tsx';

export type SessionItemState = 'needs_you' | 'working' | 'done' | 'pr_open' | 'stopped';

/** The word for each state, from the product spec ("Session states"). */
export const sessionStateLabels: Record<SessionItemState, string> = {
  needs_you: 'Needs you',
  working: 'Working',
  done: 'Done, ready for PR',
  pr_open: 'PR open',
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

const iconVariants = cva('inline-flex size-6 shrink-0 items-center justify-center rounded-full', {
  variants: {
    state: {
      needs_you: 'bg-warning-subtle text-warning',
      working: 'bg-info-subtle text-info-foreground',
      done: 'bg-success-subtle text-success',
      pr_open: 'bg-subtle text-muted-foreground',
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
  stopped: <Icon icon={StopIcon} className={glyph} />,
};

/** The state's 24 px circle with its glyph, as the sidebar draws it. For the eye only: say the state in words too. */
export function SessionStateIcon({ state, className }: { state: SessionItemState; className?: string }) {
  return (
    <span aria-hidden className={cn(iconVariants({ state }), className)}>
      {icons[state]}
    </span>
  );
}

export type SessionItemProps = Omit<ComponentProps<'a'>, 'title'> & {
  title: string;
  /** What the session was started from, for example `PROJ-1423` or `PR #2836`. */
  source?: string | undefined;
  state: SessionItemState;
  /** What "Done" is ready for. */
  ready?: SessionItemReady;
  /** Render the child element (for example a router link) as the row. */
  asChild?: boolean;
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
  className,
  children,
  ...props
}: SessionItemProps) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      className={cn(
        'flex items-start gap-3 rounded-sm px-3 py-2 text-foreground no-underline hover:bg-subtle aria-[current=page]:bg-raised aria-[current=page]:ring-1 aria-[current=page]:ring-border',
        className,
      )}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      <SessionStateIcon state={state} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        {/* The spaces keep the link's name readable ("Add bulk archive PROJ-1423 Needs you"); flex drops them visually.
            The tooltip shows a title the row cuts short; the link's name still comes from the text. */}
        <span className="truncate font-medium" title={title}>
          {title}
        </span>{' '}
        <span className="flex items-center gap-1 overflow-hidden text-small whitespace-nowrap text-muted-foreground">
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
}

/**
 * A session row while it loads: the row's own padding, its state circle and its two lines as blank
 * blocks, so nothing moves when the session arrives (spec 020: the sidebar's next 16).
 */
export function SessionItemSkeleton({ className, ...props }: Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      data-slot="session-item-skeleton"
      aria-hidden
      className={cn('flex items-start gap-3 px-3 py-2', className)}
      {...props}
    >
      <Skeleton shape="circle" className="size-6" />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex h-6 items-center">
          <Skeleton className="h-4 w-3/4" />
        </span>
        <span className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </span>
      </span>
    </div>
  );
}
