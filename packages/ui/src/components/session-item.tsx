import type { ComponentProps, ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cva } from 'class-variance-authority';
import { Check, GitBranch, Square } from 'lucide-react';
import { cn } from '../lib/cn.ts';

export type SessionItemState = 'needs_you' | 'working' | 'done' | 'pr_open' | 'stopped';

/** The word for each state, from the product spec ("Session states"). */
export const sessionStateLabels: Record<SessionItemState, string> = {
  needs_you: 'Needs you',
  working: 'Working',
  done: 'Done, ready for PR',
  pr_open: 'PR open',
  stopped: 'Stopped',
};

const iconVariants = cva('mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full', {
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

const wordVariants = cva('font-medium', {
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

/** 12 px glyphs inside the 20 px circle (components.css `.dh-session-icon .dh-icon`). */
const glyph = 'size-3 stroke-2';

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
  done: <Check className={glyph} />,
  pr_open: <GitBranch className={glyph} />,
  stopped: <Square className={glyph} />,
};

export type SessionItemProps = Omit<ComponentProps<'a'>, 'title'> & {
  title: string;
  /** What the session was started from, for example `PROJ-1423` or `PR #2836`. */
  source?: string | undefined;
  state: SessionItemState;
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
  asChild = false,
  className,
  children,
  ...props
}: SessionItemProps) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      className={cn(
        'flex items-start gap-2.5 rounded-sm px-2.5 py-2 text-foreground no-underline hover:bg-subtle aria-[current=page]:bg-raised aria-[current=page]:ring-1 aria-[current=page]:ring-border',
        className,
      )}
      {...props}
    >
      <Slot.Slottable>{children}</Slot.Slottable>
      <span aria-hidden className={iconVariants({ state })}>
        {icons[state]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        {/* The spaces keep the link's name readable ("Add bulk archive PROJ-1423 Needs you"); flex drops them visually. */}
        <span className="truncate font-medium">{title}</span>{' '}
        <span className="flex items-center gap-1 overflow-hidden text-label whitespace-nowrap text-muted-foreground">
          {source === undefined ? null : (
            <>
              <span className="font-mono">{source}</span> <span aria-hidden>·</span>{' '}
            </>
          )}
          <span className={wordVariants({ state })}>{sessionStateLabels[state]}</span>
        </span>
      </span>
    </Comp>
  );
}
