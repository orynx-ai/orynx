import { Children, useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';
import { Skeleton } from './skeleton.tsx';

export type ListNavProps = Omit<ComponentProps<'div'>, 'aria-label'> & {
  /** What the list is, for screen readers: "Your skills". */
  'aria-label': string;
  /** A search field above the list, which filters it. */
  search?: ReactNode;
  /** The line shown in place of the list when it has no items: "No skills match “rev”." */
  empty?: ReactNode;
};

/**
 * Design: `skills.html`, `dh-listnav` (spec 023). A list you pick one item from, its pick shown beside it, on a
 * `bg-sidebar` panel under its own search field. The items are {@link ListNavItem}s.
 */
export function ListNav({ 'aria-label': label, search, empty, children, className, ...props }: ListNavProps) {
  return (
    <div data-slot="list-nav" className={cn('flex flex-col gap-2 rounded-md bg-sidebar p-2', className)} {...props}>
      {search}
      {Children.count(children) === 0 ? (
        <p className="m-0 px-3 py-2.5 text-small text-muted-foreground">{empty}</p>
      ) : (
        <ul aria-label={label} className="m-0 flex list-none flex-col gap-0.5 p-0">
          {children}
        </ul>
      )}
    </div>
  );
}

export type ListNavItemProps = Omit<ComponentProps<'button'>, 'children' | 'title'> & {
  /** The item's name, in bold: "Bug bash". */
  label: ReactNode;
  /** Up to two lines under it, cut after that: what the item is for. */
  description?: ReactNode;
  /** A short tag at the end of the name's line: "Used 4 times". */
  tag?: ReactNode;
  /** The picked item: `bg-raised` with a hairline. */
  current?: boolean;
  /** Drawn before the name and description, such as a tool's mark (spec 035). Decorative. */
  mark?: ReactNode;
  /**
   * Drawn at the end, such as a status dot or a spinner (spec 035). Decorative: say the state in the label or
   * the description too.
   */
  status?: ReactNode;
};

/**
 * One item of a {@link ListNav}. Its button holds the label alone, so its name is the text it shows (axe's
 * label-in-name rule), and stretches over the whole item, so a click anywhere opens it. The tag and description are
 * the button's description: a screen reader hears "Bug bash" first and the rest after it.
 */
export function ListNavItem({
  label,
  description,
  tag,
  current = false,
  mark,
  status,
  className,
  ...props
}: ListNavItemProps) {
  const id = useId();
  const described = [tag === undefined ? null : `${id}-tag`, description === undefined ? null : `${id}-description`]
    .filter((part) => part !== null)
    .join(' ');
  return (
    <li
      data-current={current || undefined}
      className="relative flex items-center gap-2.5 rounded-sm px-3 py-2.5 text-foreground hover:bg-subtle data-current:bg-raised data-current:ring-1 data-current:ring-border"
    >
      {mark === undefined ? null : (
        <span aria-hidden className="flex shrink-0">
          {mark}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex w-full min-w-0 items-center gap-2">
          <button
            type="button"
            aria-current={current ? 'true' : undefined}
            aria-describedby={described === '' ? undefined : described}
            className={cn(
              'min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-start text-body font-medium text-foreground after:absolute after:inset-0 after:rounded-sm',
              className,
            )}
            {...props}
          >
            {label}
          </button>
          {tag === undefined ? null : (
            <span id={`${id}-tag`} className="ms-auto shrink-0 text-label font-medium text-muted-foreground">
              {tag}
            </span>
          )}
        </span>
        {description === undefined ? null : (
          <span id={`${id}-description`} className="line-clamp-2 text-small text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      {status === undefined ? null : (
        <span aria-hidden className="flex shrink-0">
          {status}
        </span>
      )}
    </li>
  );
}

export type ListNavGroupProps = Omit<ComponentProps<'li'>, 'children'> & {
  /** The group's heading, which also names its list: "Needs attention". */
  label: string;
  /** How many items it holds, at the heading's end. */
  count?: number;
  /** Its {@link ListNavItem}s, and anything that belongs under them, such as a Show more button. */
  children: ReactNode;
};

/**
 * Design: Sync activity's tool list (spec 035 Q4). A heading with its count over a list of {@link ListNavItem}s,
 * inside a {@link ListNav}. The heading is for the eye; the list it holds is named by it for screen readers,
 * which count the items themselves.
 */
export function ListNavGroup({ label, count, children, className, ...props }: ListNavGroupProps) {
  return (
    <li className={cn('flex flex-col gap-0.5', className)} {...props}>
      <span
        aria-hidden
        className="flex items-center gap-1.5 px-2.5 pt-3.5 pb-1 text-label font-medium text-muted-foreground"
      >
        <span className="flex-1">{label}</span>
        {count}
      </span>
      <ul aria-label={label} className="m-0 flex list-none flex-col gap-0.5 p-0">
        {children}
      </ul>
    </li>
  );
}

/**
 * The list's loading form: `rows` items built like real ones (a name and two lines under it) on the same panel,
 * so nothing moves when they arrive. Hidden from screen readers.
 */
export function ListNavSkeleton({
  rows = 3,
  search = true,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { rows?: number; search?: boolean }) {
  return (
    <div
      data-slot="list-nav-skeleton"
      aria-hidden
      className={cn('flex flex-col gap-2 rounded-md bg-sidebar p-2', className)}
      {...props}
    >
      {search ? <Skeleton className="h-8 w-full rounded-sm" /> : null}
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: rows }, (_, row) => (
          // A name's 24 px line and two 20 px lines under it, as a real item with a two-line description.
          <div key={row} data-slot="list-nav-skeleton-item" className="flex flex-col gap-0.5 px-3 py-2.5">
            <div className="flex h-6 items-center">
              <Skeleton className="h-4 w-2/5" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-full" />
            </div>
            <div className="flex h-5 items-center">
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
