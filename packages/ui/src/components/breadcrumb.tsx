import type { ComponentProps } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '../lib/cn.ts';

/**
 * Design system: Breadcrumb (`dh-breadcrumb`). At most three items; the first is the sidebar
 * place and the last is the current page (plain text with aria-current, not a link).
 */
export function Breadcrumb(props: ComponentProps<'nav'>) {
  return <nav aria-label="Breadcrumb" {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      className={cn('m-0 flex min-w-0 list-none items-center gap-1 p-0 text-muted-foreground', className)}
      {...props}
    />
  );
}

/** Only the last item, the current page, shrinks; the links before it keep their full width. */
export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li className={cn('inline-flex shrink-0 items-center gap-1 last:min-w-0 last:shrink', className)} {...props} />
  );
}

export function BreadcrumbLink({ asChild = false, className, ...props }: ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      className={cn(
        'rounded-xs px-1 py-1 whitespace-nowrap text-muted-foreground no-underline hover:bg-subtle hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, children, title, ...props }: ComponentProps<'span'>) {
  // One line: a long title is cut instead of wrapping the page bar, and its text stays readable as a tooltip.
  return (
    <span
      aria-current="page"
      title={title ?? (typeof children === 'string' ? children : undefined)}
      className={cn('truncate px-1 py-1 font-medium text-foreground', className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function BreadcrumbSeparator({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li role="presentation" aria-hidden className={cn('px-1 text-muted-foreground', className)} {...props}>
      /
    </li>
  );
}
