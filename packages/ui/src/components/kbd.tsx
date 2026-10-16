import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

/** Design system: keyboard hint (`dh-kbd`), e.g. ⌘K next to Search. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'rounded-xs border border-border bg-canvas px-1.25 font-mono text-label text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
