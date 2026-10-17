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

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('inline-flex min-w-0 items-center gap-1', className)} {...props} />;
}

export function BreadcrumbLink({ asChild = false, className, ...props }: ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      className={cn(
        'rounded-xs px-1 py-0.5 whitespace-nowrap text-muted-foreground no-underline hover:bg-subtle hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  // One line: a long title truncates instead of wrapping the page bar. Pass `title` so it stays readable.
  return (
    <span
      aria-current="page"
      className={cn('truncate px-1 py-0.5 font-medium text-foreground', className)}
      {...props}
    />
  );
}

export function BreadcrumbSeparator({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li role="presentation" aria-hidden className={cn('px-1 text-muted-foreground', className)} {...props}>
      /
    </li>
  );
}
