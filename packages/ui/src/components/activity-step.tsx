import type { ComponentProps, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

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
};

/**
 * Design system: activity step (`dh-step`). One step in Claude's progress: a 24 px dot with the
 * step's icon, a title and a detail line. From shadcn's `TraceLine`, without its shimmer: the
 * product needs no motion.
 */
export function ActivityStep({ state, icon, title, detail, className, ...props }: ActivityStepProps) {
  const look = state ?? 'plain';
  return (
    <li data-slot="activity-step" data-state={look} className={cn('flex gap-3', className)} {...props}>
      <span aria-hidden className={dotVariants({ state: look })}>
        {icon}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">
          {title}
          {/* The dot's colour tells the state to the eye; these words tell it to screen readers. */}
          {state ? <span className="sr-only">{spokenStates[state]}</span> : null}
        </span>
        {detail ? <span className="text-small text-muted-foreground">{detail}</span> : null}
      </span>
    </li>
  );
}
