import type { ComponentProps, ReactNode } from 'react';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { cva } from 'class-variance-authority';
import { Collapsible } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';

export type ActivityListProps = ComponentProps<'ol'>;

/**
 * The list of Claude's steps, from shadcn's `trace` (AI Elements' Task pattern). An ordered list in a
 * polite live region, so a screen reader hears each new step without losing its place (design
 * system, Accessibility rules).
 */
export function ActivityList({ className, ...props }: ActivityListProps) {
  return (
    <ol
      data-slot="activity-list"
      aria-live="polite"
      className={cn('m-0 flex list-none flex-col gap-3.5 p-0', className)}
      {...props}
    />
  );
}

export type ActivityStepState = 'done' | 'waiting';

const dotVariants = cva(
  'inline-flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5 [&_svg]:stroke-2',
  {
    variants: {
      state: {
        done: 'bg-success-subtle text-success',
        waiting: 'bg-warning-subtle text-warning',
        plain: 'bg-subtle text-muted-foreground',
      },
    },
  },
);

/** The sidebar's words for these states: Stepper's ", done" and the session's "Needs you". */
const spokenStates: Record<ActivityStepState, string> = { done: ', done', waiting: ', needs you' };

export type ActivityStepProps = Omit<ComponentProps<'li'>, 'title'> & {
  /** Done is green, waiting for you is amber; leave it out for a step that's running or still to come. */
  state?: ActivityStepState | undefined;
  /** A lucide icon for what the step did (read, edit, run). Drawn at 14 px in the dot. */
  icon: ReactNode;
  /** What Claude did or wants to do, in a few words. */
  title: ReactNode;
  /** One line more: which files, the counts, why it waits. */
  detail?: ReactNode;
  /** Makes the title a button that shows the step in full, such as everything Claude was sent. */
  onOpen?: (() => void) | undefined;
};

/**
 * Design system: activity step (`dh-step`). One step in Claude's progress: a 24 px dot with the
 * step's icon, a title and a detail line. From shadcn's `TraceLine`, without its shimmer: the
 * product needs no motion. A step with more to show has a title you can press (the user's call, 19 Oct 2026).
 */
export function ActivityStep({ state, icon, title, detail, onOpen, className, ...props }: ActivityStepProps) {
  const look = state ?? 'plain';
  return (
    <li data-slot="activity-step" data-state={look} className={cn('flex gap-3', className)} {...props}>
      <span aria-hidden className={dotVariants({ state: look })}>
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">
          {onOpen === undefined ? (
            title
          ) : (
            <button
              type="button"
              onClick={onOpen}
              className="cursor-pointer rounded-xs border-0 bg-transparent p-0 text-start font-medium text-foreground hover:underline"
            >
              {title}
            </button>
          )}
          {/* The dot's colour tells the state to the eye; these words tell it to screen readers. */}
          {state ? <span className="sr-only">{spokenStates[state]}</span> : null}
        </span>
        {/* A div, so a detail may hold blocks such as Claude's summary laid out as Markdown. */}
        {detail ? <div className="text-small text-muted-foreground">{detail}</div> : null}
      </div>
    </li>
  );
}

export type ActivityGroupProps = Omit<ComponentProps<typeof Collapsible.Root>, 'asChild' | 'title'> & {
  /** Done is green, waiting for you is amber; leave it out for the step Claude is on. */
  state?: ActivityStepState | undefined;
  /** The icon of the step's latest row, drawn at 14 px in the dot. */
  icon: ReactNode;
  /** The step, in the stepper's words: "Apply fixes". */
  title: ReactNode;
  /** One line, cut: the step's latest row. */
  summary?: ReactNode;
  /** How long the step took: "18 min"; left out while it goes on. */
  time?: string | undefined;
  /** The step's rows, shown under it once it's open. */
  children: ReactNode;
};

/**
 * One step of the session in What Claude did (spec 048, `session-review.html`): its dot, words, latest row and time, and
 * a chevron, as one button across the row that opens the step's rows in place. From Radix Collapsible, as `HistoryRow`:
 * `aria-expanded` and `aria-controls` come with it, and Enter or Space open it as a click does.
 */
export function ActivityGroup({
  state,
  icon,
  title,
  summary,
  time,
  children,
  className,
  ...props
}: ActivityGroupProps) {
  return (
    <Collapsible.Root asChild {...props}>
      <li data-slot="activity-group" className={cn('border-b border-border', className)}>
        <Collapsible.Trigger className="group flex w-full cursor-pointer items-center gap-3 rounded-sm border-0 bg-transparent py-2.5 text-start text-foreground">
          <span aria-hidden className={dotVariants({ state: state ?? 'plain' })}>
            {icon}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-medium group-hover:underline">
              {title}
              {state ? <span className="sr-only">{spokenStates[state]}</span> : null}
            </span>
            {summary ? <span className="truncate text-small text-muted-foreground">{summary}</span> : null}
          </span>
          {time === undefined ? null : <span className="shrink-0 text-small text-muted-foreground">{time}</span>}
          <Icon
            icon={ArrowRight01Icon}
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground group-data-[state=open]:rotate-90 motion-safe:transition-transform"
          />
        </Collapsible.Trigger>
        {/* Under the words, past the dot and its gap. */}
        <Collapsible.Content className="ps-9 pb-3">{children}</Collapsible.Content>
      </li>
    </Collapsible.Root>
  );
}
