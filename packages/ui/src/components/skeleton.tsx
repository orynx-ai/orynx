import type { ComponentProps } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';

const skeletonVariants = cva('block shrink-0 bg-subtle', {
  variants: { shape: { rect: 'rounded-sm', circle: 'rounded-full' } },
  defaultVariants: { shape: 'rect' },
});

export type SkeletonProps = Omit<ComponentProps<'span'>, 'children'> & VariantProps<typeof skeletonVariants>;

/**
 * A plain `bg-subtle` block that holds the place of content still loading (spec 006 Q4a; the design
 * system draws none). From shadcn's `skeleton`, without its pulse: the product needs no motion.
 * Give it the size of what replaces it through `className`, so nothing moves when the content
 * arrives, and mark the region around it `aria-busy`.
 */
export function Skeleton({ shape, className, ...props }: SkeletonProps) {
  return <span data-slot="skeleton" aria-hidden className={cn(skeletonVariants({ shape }), className)} {...props} />;
}
