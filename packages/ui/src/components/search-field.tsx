import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { Input } from './input.tsx';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'type' | 'size'> & {
  /** A search box has no visible label, so it needs a name: "Search tickets". */
  'aria-label': string;
  /** 40 px, like Input; `sm` is 32 px, as the page bar draws it (spec 008, Q10c). */
  size?: 'default' | 'sm';
};

/**
 * Design system: Input's search form (`dh-search`). The search icon sits 12 px in, and the text starts
 * 40 px in, after it. `className` sizes the box around it, such as its width.
 */
export function SearchField({ size = 'default', className, ...props }: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn('relative flex min-w-0 items-center', className)}>
      <Search aria-hidden className="pointer-events-none absolute start-3 text-muted-foreground" />
      <Input type="search" className={cn('ps-10', size === 'sm' && 'h-8')} {...props} />
    </div>
  );
}
