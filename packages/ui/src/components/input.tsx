import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';

/**
 * Design system: Input (`dh-input`), a single-line text field, 40 px tall. Put it inside `<Field>`
 * for its label, help and error; on its own (a search box) give it an `aria-label`. Inside a field,
 * the field's id wins over one passed here, so the label always points at it.
 */
export function Input({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControl();
  return (
    <input
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-sm border border-control bg-raised px-3 text-body text-foreground placeholder:text-placeholder not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
        className,
      )}
      {...props}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    />
  );
}
