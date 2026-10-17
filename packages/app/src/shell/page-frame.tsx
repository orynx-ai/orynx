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

/** The page's side gutter: 16 px, 48 px from 768 px. The page bar, toolbar, body and banners share it. */
export const pageGutter = 'px-4 md:px-12';

/**
 * The frame every screen uses (design system: PageHeader, sized by the Clean UI skill): a 56 px
 * page bar, an optional toolbar for filters, then the body. Bars are split by a hairline, never
 * colour. These parts own their geometry, so they take no `className`: change them here, never
 * at a call site.
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
    // One line at every width: the crumb is cut first, and under 768 px the meta steps aside.
    <header className={cn('flex min-h-14 items-center gap-3 border-b border-border py-2', pageGutter)}>
      {breadcrumb}
      {meta ? <span className="shrink-0 text-small text-muted-foreground max-md:hidden">{meta}</span> : null}
      {actions ? <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Toolbar(props: Omit<ComponentProps<'div'>, 'className' | 'style'>) {
  return (
    <div
      {...props}
      className={cn('flex min-h-14 flex-wrap items-center gap-2 border-b border-border py-2', pageGutter)}
    />
  );
}

/**
 * The three content widths (Clean UI): `wide` for lists, settings and detail pages; `narrow` for
 * sparse pages and reading columns; `full` only for a board or table that 960 px would squeeze.
 */
export type PageWidth = 'narrow' | 'wide' | 'full';

const pageWidths: Record<PageWidth, string> = {
  narrow: 'max-w-180',
  wide: 'max-w-240',
  full: '',
};

/**
 * The gutter (16 px, 48 px from 768 px) sits on the outer box and the measure on the inner one,
 * so the padding never eats into the width. Sections inside are 24 px apart.
 */
export function PageBody({
  width = 'wide',
  ...props
}: Omit<ComponentProps<'div'>, 'className' | 'style'> & { width?: PageWidth }) {
  return (
    <div className={pageGutter}>
      <div {...props} className={cn('mx-auto flex w-full min-w-0 flex-col gap-6 pt-6 pb-8', pageWidths[width])} />
    </div>
  );
}

/** A sidebar place: the first crumb is always one of these. */
export type Place = '/' | '/tickets' | '/sessions' | '/settings';

export interface Crumb {
  label: string;
  /** Leave out for the current page, which is never a link. */
  to?: Place;
}

/** Breadcrumb for the page bar, with router links. At most three crumbs; a long last one truncates. */
export function PageBreadcrumb({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <Breadcrumb className="max-w-full min-w-0">
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
