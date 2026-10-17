import type { ComponentProps, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  cn,
} from '@devhub/ui';

/**
 * The frame every screen uses (design system: PageHeader): a 52 px page bar, an optional
 * 48 px toolbar for filters, then the body. Bars are split by a hairline, never colour.
 */
export function PageBar({
  breadcrumb,
  meta,
  actions,
}: {
  breadcrumb: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex min-h-13 flex-wrap items-center gap-3 border-b border-border px-6 py-1.5">
      {breadcrumb}
      {meta ? <span className="text-small text-muted-foreground">{meta}</span> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Toolbar({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-h-12 flex-wrap items-center gap-2 border-b border-border px-6 py-1.5', className)}
      {...props}
    />
  );
}

export function PageBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex min-w-0 flex-col gap-4 p-6', className)} {...props} />;
}

/** A sidebar place: the first crumb is always one of these. */
export type Place = '/' | '/tickets' | '/sessions' | '/settings';

export interface Crumb {
  label: string;
  /** Leave out for the current page, which is never a link. */
  to?: Place;
}

/** Breadcrumb for the page bar, with router links. At most three crumbs. */
export function PageBreadcrumb({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => (
          <CrumbItem key={crumb.label} crumb={crumb} first={index === 0} />
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function CrumbItem({ crumb, first }: { crumb: Crumb; first: boolean }) {
  return (
    <>
      {first ? null : <BreadcrumbSeparator />}
      <BreadcrumbItem>
        {crumb.to === undefined ? (
          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
        ) : (
          <BreadcrumbLink asChild>
            {/* Exact, so a parent place is never marked current next to the page itself. */}
            <Link to={crumb.to} activeOptions={{ exact: true }}>
              {crumb.label}
            </Link>
          </BreadcrumbLink>
        )}
      </BreadcrumbItem>
    </>
  );
}
