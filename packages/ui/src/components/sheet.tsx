import type { ComponentProps, ReactNode } from 'react';
import { ArrowLeft01Icon, ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { cn } from '../lib/cn.ts';
import { Icon } from './icon.tsx';
import { IconButton } from './icon-button.tsx';

export type SheetProps = ComponentProps<typeof DialogPrimitive.Root>;

/**
 * A panel that slides in over the page from the right, such as Tickets' filters (spec 039, Q6: shadcn's `sheet`,
 * restyled to the tokens `Dialog` uses). It is a dialog underneath: focus moves in and stays in, Esc, Close or a
 * click beside it closes it, and focus goes back to what opened it.
 */
export function Sheet(props: SheetProps) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export type SheetContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & {
  /** Names the sheet, in its head beside Close: "Filters", or the page it has gone into: "Status". */
  title: ReactNode;
  /** On a page inside the sheet (spec 039): the back button before the title, and where it goes. */
  back?: { label: string; onBack: () => void } | undefined;
};

/**
 * The sheet itself, in a portal: as tall as the window, 400 px wide (the whole width when the window is narrower),
 * `bg-raised` with a hairline on its open side and the one shadow. Its head holds the title and Close; put the part
 * that scrolls in `SheetBody` and the actions in `SheetFoot`. Behind it the page fades towards the canvas, as
 * behind a dialog, and doesn't scroll.
 */
export function SheetContent({ title, back, className, children, onOpenAutoFocus, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-canvas/70 motion-safe:animate-fade-in"
      />
      <DialogPrimitive.Content
        data-slot="sheet"
        // Nothing describes it unless the caller says so; Radix would otherwise warn.
        aria-describedby={undefined}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          // The sheet itself takes focus, so a screen reader hears its title and the first Esc closes it: Radix
          // would focus Close, whose tooltip opens on keyboard focus and would take that Esc.
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus();
        }}
        className={cn(
          'fixed inset-y-0 end-0 z-50 flex w-full max-w-100 flex-col border-s border-border bg-raised text-body text-foreground shadow-overlay outline-none motion-safe:animate-sheet-in',
          className,
        )}
        {...props}
      >
        <div
          className={cn(
            'flex items-center gap-2 border-b border-border py-3 pe-3',
            back === undefined ? 'ps-5' : 'ps-3',
          )}
        >
          {back === undefined ? null : (
            <IconButton variant="ghost" size="sm" label={back.label} onClick={back.onBack}>
              <Icon icon={ArrowLeft01Icon} aria-hidden />
            </IconButton>
          )}
          <DialogPrimitive.Title className="m-0 text-title font-medium">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Close asChild>
            <IconButton variant="ghost" size="sm" label="Close" className="ms-auto">
              <Icon icon={Cancel01Icon} aria-hidden />
            </IconButton>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** The sheet's content, which scrolls when it's taller than the window. */
export function SheetBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-body"
      className={cn('flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-4', className)}
      {...props}
    />
  );
}

/** The sheet's foot (as `DialogFoot`): a hairline above, the sidebar's tint, its content spread across. */
export function SheetFoot({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-foot"
      className={cn('flex flex-wrap items-center gap-2 border-t border-border bg-sidebar px-5 py-3', className)}
      {...props}
    />
  );
}

export type SheetRowProps = Omit<ComponentProps<'button'>, 'title' | 'children'> & {
  /** What the row opens: "Status". */
  title: string;
  /** How many of its options are picked, in an ink bubble after the title; nothing at 0. */
  count?: number;
  /** What's picked now, one quiet line, cut short: "Any", or "In review, Done". */
  summary: string;
};

/**
 * One row of a sheet's list that leads on (spec 039, the user's pattern for Filters): its title with a count, what's
 * picked under it, and a chevron. Rows are divided by hairlines and fill the sheet's width, so put them in a
 * `SheetBody` with no padding. Its name says all three: "Status · 2, In review, Done".
 */
export function SheetRow({ title, count, summary, className, ...props }: SheetRowProps) {
  const counted = count !== undefined && count > 0;
  return (
    <button
      type="button"
      data-slot="sheet-row"
      aria-label={counted ? `${title} · ${String(count)}, ${summary}` : `${title}, ${summary}`}
      className={cn(
        'flex min-h-16 w-full shrink-0 cursor-pointer items-center gap-3 border-b border-border px-5 py-3 text-start text-foreground hover:bg-subtle',
        className,
      )}
      {...props}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 font-medium">
          {title}
          {counted ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-label font-medium text-primary-foreground">
              {count}
            </span>
          ) : null}
        </span>
        <span className="truncate text-small text-muted-foreground">{summary}</span>
      </span>
      <Icon icon={ArrowRight01Icon} aria-hidden className="text-muted-foreground" />
    </button>
  );
}
