import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/cn.ts';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'type' | 'aria-label'> & {
  /** Search fields hide their label from the eye, never from screen readers (design system, Accessibility). */
  'aria-label': string;
};

/**
 * Design system: search field (`dh-search`). A magnifier inside a 32 px search input, as the Tickets
 * toolbar draws it. `className` sizes the whole field, so the magnifier stays inside the box.
 */
export function SearchField({ className, ...props }: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn('relative flex min-w-0 items-center', className)}>
      <Search aria-hidden className="pointer-events-none absolute start-3 text-muted-foreground" />
      <input
        type="search"
        className="h-8 w-full min-w-0 rounded-sm border border-control bg-raised ps-10 pe-3 text-small text-foreground placeholder:text-placeholder"
        {...props}
      />
    </div>
  );
}
