import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { Tooltip } from './tooltip.tsx';

export type ContextListProps = ComponentProps<'ul'> & {
  /** What the chips are, for screen readers: "Context for Claude". */
  'aria-label': string;
};

/**
 * The row of context chips above the Composer's text box: at most two chips, then {@link ContextMore} (spec 022,
 * Q6), on one line at any width. A chip gives up room before +N does, and cuts its text to fit.
 */
export function ContextList({ className, ...props }: ContextListProps) {
  return (
    <ul
      data-slot="context-list"
      className={cn('m-0 flex min-w-0 list-none gap-1.5 p-0 px-0.5 pt-0.5', className)}
      {...props}
    />
  );
}

export type ContextChipProps = Omit<ComponentProps<'li'>, 'children'> & {
  /** What was added: "PROJ-1423", "web-app #2836", a file's name. Long text is cut off; the full text shows on hover. */
  label: string;
  /** The source's mark, or a lucide icon for a file. */
  icon?: ReactNode;
  /** Called when the person removes the chip. The screen takes it out of the list. */
  onRemove: () => void;
};

/**
 * Moves focus on before the chip goes, so it never falls back to the page: to the next chip's
 * remove button, or to the text box when this was the last chip.
 */
function focusAfterRemoving(event: MouseEvent<HTMLButtonElement>): void {
  const chip = event.currentTarget.closest('li');
  const next = chip?.nextElementSibling?.querySelector('button');
  const textBox = event.currentTarget.closest('form')?.querySelector('textarea');
  (next ?? textBox)?.focus();
}

/**
 * Design system: context chip (`dh-context`). One thing Claude will work from, added with + Add
 * context. From shadcn's `attachment`, drawn as the design system's 32 px chip: the mark or icon,
 * the text, and a 24 px remove button whose clickable area is 32 px (spec 006 Q2b).
 */
export function ContextChip({ label, icon, onRemove, className, ...props }: ContextChipProps) {
  return (
    <li
      data-slot="context-chip"
      className={cn(
        'inline-flex h-8 max-w-75 min-w-0 shrink items-center gap-1.5 rounded-sm border border-border bg-sidebar ps-2 pe-1 text-small font-medium text-foreground [&>svg]:text-muted-foreground',
        className,
      )}
      {...props}
    >
      {icon}
      <span title={label} className="min-w-0 truncate">
        {label}
      </span>
      <Tooltip label="Remove">
        <button
          type="button"
          aria-label={`Remove ${label}`}
          onClick={(event) => {
            focusAfterRemoving(event);
            onRemove();
          }}
          className="relative inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-xs border-0 bg-transparent text-muted-foreground after:absolute after:-inset-1 hover:bg-subtle hover:text-foreground [&_svg]:size-3.5 [&_svg]:stroke-2"
        >
          <Icon icon={Cancel01Icon} aria-hidden />
        </button>
      </Tooltip>
    </li>
  );
}

export type ContextMoreProps = Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & {
  /** How many chips aren't shown: "+3". */
  count: number;
  /** What it opens, for screen readers, after the "+3" it shows: "Show all 5 items of context". */
  label: string;
  /** The words on hover and focus: "Show all context". */
  tooltip: string;
};

/**
 * Not in the design system; spec 022 Q6 draws it as a context chip without its ×: the chips past the first two,
 * as "+3", a button that opens the dialog listing every one. It never shrinks, so it always shows.
 */
export function ContextMore({ count, label, tooltip, className, ...props }: ContextMoreProps) {
  return (
    <li data-slot="context-more" className="flex shrink-0">
      <Tooltip label={tooltip}>
        <button
          type="button"
          aria-haspopup="dialog"
          className={cn(
            'relative inline-flex h-8 cursor-pointer items-center rounded-sm border border-border bg-sidebar px-2 text-small font-medium text-foreground hover:bg-subtle',
            className,
          )}
          // One string, starting with what it shows, so a voice command for "+3" finds it (WCAG 2.5.3). A hidden span
          // after "+3" read as "+3 : Show…" in Chrome, since the span is laid out as a block.
          aria-label={`+${String(count)}: ${label}`}
          {...props}
        >
          +{count}
        </button>
      </Tooltip>
    </li>
  );
}
