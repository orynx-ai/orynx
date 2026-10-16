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
      className={cn('m-0 flex list-none flex-wrap items-center gap-1 p-0 text-small text-muted-foreground', className)}
      {...props}
    />
  );
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('inline-flex items-center gap-1', className)} {...props} />;
}

export function BreadcrumbLink({ asChild = false, className, ...props }: ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a';
  return (
    <Comp
      className={cn(
        'rounded-xs px-1 py-0.5 text-muted-foreground no-underline hover:bg-subtle hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-current="page" className={cn('px-1 py-0.5 font-medium text-foreground', className)} {...props} />;
}

export function BreadcrumbSeparator({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li role="presentation" aria-hidden className={cn('px-1 text-muted-foreground', className)} {...props}>
      /
    </li>
  );
}
