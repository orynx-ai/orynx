import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';

/**
 * Not in the design system: Input's look (`dh-input`) over several lines, for text that needs them, such as a pull
 * request's description (the user's answer, spec 014 Q10b; from shadcn's textarea). 10 lines show before it
 * scrolls inside, and it can be made taller or shorter. Put it inside `<Field>` for its label, help and error, as
 * Input; inside a field, the field's id wins over one passed here.
 */
export function Textarea({ className, rows = 10, ...props }: ComponentProps<'textarea'>) {
  const field = useFieldControl();
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        'block w-full min-w-0 resize-y overflow-y-auto rounded-sm border border-control bg-raised px-3 py-2 text-body text-foreground placeholder:text-placeholder not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
        className,
      )}
      {...props}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    />
  );
}
