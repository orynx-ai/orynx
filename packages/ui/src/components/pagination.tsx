import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { ArrowLeft01Icon, ArrowRight01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { buttonVariants } from './button.tsx';
import { Icon } from './icon.tsx';
import { Tooltip } from './tooltip.tsx';

export type PagerItem =
  { kind: 'page'; page: number; wide: boolean; narrow: boolean } | { kind: 'gap'; wide: boolean; narrow: boolean };

/** At most this many numbers and gaps between Previous and Next. */
const slots = 7;

/**
 * Which page numbers the pager shows, and where an ellipsis stands for the ones left out (spec 007 Q10f).
 * Wide: every page up to 7; past that the first, the last and the current page's neighbours, with the
 * first or last five when the current page is near either end, so the pager keeps its width. Under
 * 480 px (`narrow`): only the first, the last, the current page and its neighbours.
 */
export function pagerItems(page: number, count: number): PagerItem[] {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
  const wide =
    count <= slots
      ? range(1, count)
      : page <= 4
        ? [...range(1, 5), count]
        : page >= count - 3
          ? [1, ...range(count - 4, count)]
          : [1, page - 1, page, page + 1, count];
  const narrow = new Set([1, page - 1, page, page + 1, count]);

  const items: PagerItem[] = [];
  wide.forEach((number, index) => {
    const before = wide[index - 1];
    if (before !== undefined && number - before > 1) items.push({ kind: 'gap', wide: true, narrow: true });
    items.push({ kind: 'page', page: number, wide: true, narrow: narrow.has(number) });
  });

  // A run of numbers only the wide pager shows gets its own ellipsis under 480 px, unless one is already beside it.
  const withNarrowGaps: PagerItem[] = [];
  items.forEach((item, index) => {
    withNarrowGaps.push(item);
    const next = items[index + 1];
    const endsHiddenRun = item.kind === 'page' && !item.narrow && (next === undefined || next.narrow);
    if (!endsHiddenRun) return;
    let start = index;
    while (start > 0 && items[start - 1]?.kind === 'page' && items[start - 1]?.narrow === false) start -= 1;
    const besideGap = items[start - 1]?.kind === 'gap' || next?.kind === 'gap';
    if (!besideGap) withNarrowGaps.push({ kind: 'gap', wide: false, narrow: true });
  });
  return withNarrowGaps;
}

/** Hides an item in the wide pager or under 480 px, by the pager's own width. Whole class names, for Tailwind. */
function shownWhen({ wide, narrow }: { wide: boolean; narrow: boolean }): string {
  if (!wide) return 'hidden @max-[30rem]:flex';
  return narrow ? 'flex' : 'flex @max-[30rem]:hidden';
}

export type PaginationProps = Omit<ComponentProps<'nav'>, 'children'> & {
  /** The page shown, from 1. */
  page: number;
  pageCount: number;
  /**
   * The link to a page with these children: the router's `<Link>` or an `<a href>`. The pager gives it
   * its look and `aria-current`.
   */
  pageLink: (page: number, children: ReactNode) => ReactElement;
};

/**
 * Pages of a long list (spec 007 Q10f; from shadcn's `pagination`, which the design system doesn't
 * draw). Previous, the page numbers and Next, centred; the current page carries the tabs' selection
 * mark (Q11a) and `aria-current="page"`. The pages are links, so the page can live in the address.
 * Under 480 px of its own width, Previous and Next keep only their arrows and fewer numbers show.
 * Nothing shows for a single page.
 */
export function Pagination({ page, pageCount, pageLink, className, ...props }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label="Pages"
      data-slot="pagination"
      className={cn('@container flex w-full justify-center', className)}
      {...props}
    >
      {/* Under 480 px nine 32 px stops only fit side by side. */}
      <ul className="m-0 flex list-none items-center gap-1 p-0 @max-[30rem]:gap-0">
        <li className="flex">
          <Step page={page > 1 ? page - 1 : null} pageLink={pageLink} label="Previous page">
            <Icon icon={ArrowLeft01Icon} aria-hidden />
            <span className="@max-[30rem]:hidden">Previous</span>
          </Step>
        </li>
        {pagerItems(page, pageCount).map((item, index) =>
          item.kind === 'gap' ? (
            <li
              // Gaps have no identity of their own; their place in the row is stable for a given page.
              key={`gap-${String(index)}`}
              aria-hidden
              className={cn('size-8 items-center justify-center text-muted-foreground', shownWhen(item))}
            >
              <Icon icon={MoreHorizontalIcon} />
            </li>
          ) : (
            <li key={item.page} className={shownWhen(item)}>
              <Slot.Root
                aria-current={item.page === page ? 'page' : undefined}
                className={cn(
                  // icon-buttons-ignore-next-line: a page number shows its own words, so it needs no tooltip
                  buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                  'relative text-small text-muted-foreground hover:text-foreground',
                  // The tabs' selection mark: the number in full colour over an info underline (spec 007 Q11a).
                  item.page === page &&
                    'text-foreground after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-info',
                )}
              >
                {pageLink(item.page, String(item.page))}
              </Slot.Root>
            </li>
          ),
        )}
        <li className="flex">
          <Step page={page < pageCount ? page + 1 : null} pageLink={pageLink} label="Next page">
            <span className="@max-[30rem]:hidden">Next</span>
            <Icon icon={ArrowRight01Icon} aria-hidden />
          </Step>
        </li>
      </ul>
    </nav>
  );
}

const stepLook = cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2 @max-[30rem]:w-8 @max-[30rem]:px-0');

/**
 * Previous or Next: a link, or a link that's unavailable (and out of the Tab order) at either end. Under
 * 480 px only its arrow shows, so its words are always in a tooltip too (spec 020).
 */
function Step({
  page,
  pageLink,
  label,
  children,
}: Pick<PaginationProps, 'pageLink'> & { page: number | null; label: string; children: ReactNode }) {
  if (page === null) {
    return (
      <Tooltip label={label}>
        <span role="link" aria-disabled="true" aria-label={label} className={stepLook}>
          {children}
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={label}>
      <Slot.Root aria-label={label} className={stepLook}>
        {pageLink(page, children)}
      </Slot.Root>
    </Tooltip>
  );
}
