import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react';
import { ArrowUpRight01Icon, Calendar03Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Avatar } from './avatar.tsx';
import { Button, type ButtonProps } from './button.tsx';
import { Skeleton } from './skeleton.tsx';
import { Icon } from './icon.tsx';

/** The title's id, so the card is named by its title. */
const TitleIdContext = createContext<string | undefined>(undefined);

export type WorkItemPriorityLevel = 'high' | 'medium' | 'low';

export type WorkItemCardProps = Omit<ComponentProps<'article'>, 'title' | 'children'> & {
  /** The ticket's key, in mono: "PROJ-1423". */
  itemKey: string;
  /** The ticket's type as a word: "Story", "Bug". */
  type: string;
  /** Draws the type in `danger`, as bugs are. */
  bug?: boolean | undefined;
  /** Who the ticket is assigned to; `label` says so for screen readers and on hover ("Assigned to you"). */
  assignee?: { initials: string; label?: string } | undefined;
  /** How many of the three bars are filled, and Jira's word for it. */
  priority?: { level: WorkItemPriorityLevel; label: ReactNode } | undefined;
  /** The due date as the screen writes it; `soon` draws it in `warning` (due this week). */
  due?: { label: ReactNode; soon?: boolean } | undefined;
  /** The title link: `<WorkItemTitle>`. */
  title: ReactNode;
  /** At the end of the meta row: an `AgentChip`, or `<WorkItemBuild>` when the ticket has no session. */
  action?: ReactNode;
};

/** Filled bars for each level; the rest are drawn faint. */
const filledBars: Record<WorkItemPriorityLevel, number> = { high: 3, medium: 2, low: 1 };
const bars = [
  { x: 1, y: 8, height: 5 },
  { x: 5.5, y: 5, height: 8 },
  { x: 10, y: 2, height: 11 },
];

export interface WorkItemPriorityProps {
  level: WorkItemPriorityLevel;
  /** Jira's own word for it: "High", "P2". */
  label: ReactNode;
}

/** The priority bars and their word, as the card's meta row draws them; the list view uses them too (spec 008). */
export function WorkItemPriority({ level, label }: WorkItemPriorityProps) {
  return (
    <span className="inline-flex items-center gap-1">
      {/* 16 px, as the design draws the card's meta icons (spec 006 Q2c). */}
      <svg viewBox="0 0 14 14" aria-hidden className="size-4 shrink-0">
        {bars.map((bar, index) => (
          <rect
            key={bar.x}
            x={bar.x}
            y={bar.y}
            width="3"
            height={bar.height}
            rx="1"
            className={index < filledBars[level] ? 'fill-foreground' : 'fill-control opacity-35'}
          />
        ))}
      </svg>
      {label}
    </span>
  );
}

/**
 * Design system: WorkItemCard (`dh-card`). One ticket on a board: key and type, title (two lines at
 * most), priority, due date, assignee, and either Claude's state or a quiet "Build with Claude". The
 * title is the link to the ticket; the card isn't one big link, so its action stays reachable by
 * keyboard. The border darkens on hover; no shadow.
 */
export function WorkItemCard({
  itemKey,
  type,
  bug = false,
  assignee,
  priority,
  due,
  title,
  action,
  className,
  ...props
}: WorkItemCardProps) {
  const titleId = useId();
  return (
    <TitleIdContext value={titleId}>
      <article
        data-slot="work-item-card"
        aria-labelledby={titleId}
        className={cn(
          'flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-raised px-3 py-2.5 hover:border-control',
          className,
        )}
        {...props}
      >
        <div className="flex min-w-0 items-center gap-2">
          <WorkItemKey>{itemKey}</WorkItemKey>
          <span className={cn('text-label font-medium', bug ? 'text-danger' : 'text-muted-foreground')}>{type}</span>
          {assignee ? (
            <Avatar
              initials={assignee.initials}
              {...(assignee.label ? { label: assignee.label } : {})}
              className="ms-auto"
            />
          ) : null}
        </div>
        {title}
        {/* 32 px, the Build button's height, so a card is as tall with an agent chip as without. */}
        <div className="flex min-h-8 flex-wrap items-center gap-2.5 text-small text-muted-foreground">
          {priority ? <WorkItemPriority level={priority.level} label={priority.label} /> : null}
          {due ? (
            <span className={cn('inline-flex items-center gap-1', due.soon && 'font-medium text-warning')}>
              <Icon icon={Calendar03Icon} aria-hidden className="size-4" />
              {due.label}
            </span>
          ) : null}
          {action ? <span className="ms-auto inline-flex">{action}</span> : null}
        </div>
      </article>
    </TitleIdContext>
  );
}

/** A ticket's key in mono, as the card's top row draws it; the list view uses it too (spec 008). */
export function WorkItemKey({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('font-mono text-code text-muted-foreground', className)} {...props} />;
}

/**
 * A card's loading form (spec 006 Q4a): the same frame, rows and gaps as a card with a two-line
 * title, the usual length at a board column's width, so nothing moves when tickets arrive, whether
 * they show an agent chip or the Build button. Hidden
 * from screen readers; mark the column around it `aria-busy`.
 */
export function WorkItemCardSkeleton({ className, ...props }: Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      data-slot="work-item-card-skeleton"
      aria-hidden
      className={cn('flex flex-col gap-1.5 rounded-md border border-border bg-raised px-3 py-2.5', className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-10" />
        <Skeleton shape="circle" className="ms-auto size-7" />
      </div>
      {/* Two 24 px title lines. */}
      <div className="flex flex-col gap-2 py-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
      </div>
      <div className="flex min-h-8 items-center gap-2.5">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="ms-auto h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export type WorkItemTitleProps = ComponentProps<'a'> & {
  /** Render the child link (the router's) with the title's look. */
  asChild?: boolean;
  /**
   * It opens outside Orynx, in Jira: the arrow after it, and on hover the `bg-subtle` highlight with the
   * underline, as every external link (the user's call, 18 Oct 2026).
   */
  external?: boolean;
};

/** The card's title: the link to the ticket or its session, cut off with an ellipsis after two lines. */
export function WorkItemTitle({
  asChild = false,
  external = false,
  className,
  children,
  ...props
}: WorkItemTitleProps) {
  const titleId = useContext(TitleIdContext);
  if (external) {
    return (
      <a
        id={titleId}
        data-slot="work-item-title"
        className={cn(
          'flex items-start gap-1 rounded-xs font-medium text-foreground no-underline hover:bg-subtle hover:underline',
          className,
        )}
        {...props}
      >
        {/* Only the text is cut off after two lines; the arrow stays beside its first. */}
        <span className="line-clamp-2 min-w-0">{children}</span>
        <Icon icon={ArrowUpRight01Icon} aria-hidden className="mt-1 size-3.5" />
      </a>
    );
  }
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      id={titleId}
      data-slot="work-item-title"
      className={cn('line-clamp-2 font-medium text-foreground no-underline hover:underline', className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

export type WorkItemBuildProps = Omit<ButtonProps, 'variant' | 'size'> & {
  /** The ticket's key, so the button's name says which ticket: "Build PROJ-1377 with Claude". */
  itemKey: string;
};

/**
 * The quiet "Build with Claude" action on a card without a session: an icon-only ghost button with
 * a sparkle. A button when it starts the session here, the router's link (`asChild`) when it goes
 * somewhere.
 */
export function WorkItemBuild({ itemKey, asChild = false, className, children, ...props }: WorkItemBuildProps) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      asChild={asChild}
      aria-label={`Build ${itemKey} with Claude`}
      title="Build with Claude"
      className={cn('text-muted-foreground hover:text-info', className)}
      {...props}
    >
      <Icon icon={SparklesIcon} aria-hidden />
      {asChild ? <Slot.Slottable>{children}</Slot.Slottable> : null}
    </Button>
  );
}
