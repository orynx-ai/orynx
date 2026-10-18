import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';

/**
 * A native `<select>` drawn like `Input`: 40 px, the `border-control` outline and the shared focus ring
 * (spec 005 Q4, Settings › Repositories' Jira project). Native, so typing a letter jumps through a long
 * list and the open list follows the theme. Put it inside `<Field>` for its label, help and error; on its
 * own give it an `aria-label`. `className` sizes the box around it, never its colours.
 */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  const field = useFieldControl();
  return (
    <div className={cn('relative w-full min-w-0', className)}>
      <select
        data-slot="select"
        className="h-10 w-full min-w-0 cursor-pointer appearance-none rounded-sm border border-control bg-raised ps-3 pe-10 text-body text-foreground not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger"
        {...props}
        {...(field
          ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
          : {})}
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute end-3 top-2.5 text-muted-foreground" />
    </div>
  );
}
