import type { ComponentProps } from 'react';
import { Search } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { Input } from './input.tsx';

export type SearchFieldProps = Omit<ComponentProps<'input'>, 'type' | 'size'> & {
  /** Search fields hide their label from the eye, never from screen readers (design system, Accessibility). */
  'aria-label': string;
  /**
   * 40 px, like Input; `sm` is 32 px in `text-small`, like the other 32 px controls, as the Tickets page bar
   * and Home's toolbar draw it (specs 007 Q10b, 008 Q10c).
   */
  size?: 'default' | 'sm';
};

/**
 * Design system: Input's search form (`dh-search`). The search icon sits 12 px in, and the text starts
 * 40 px in, after it. `className` sizes the whole field, such as its width, so the icon stays inside the box.
 */
export function SearchField({ size = 'default', className, ...props }: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn('relative flex min-w-0 items-center', className)}>
      <Search aria-hidden className="pointer-events-none absolute start-3 text-muted-foreground" />
      <Input type="search" className={cn('ps-10', size === 'sm' && 'h-8 text-small')} {...props} />
    </div>
  );
}
