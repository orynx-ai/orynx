import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';

/**
 * Design system: Input (`dh-input`), a single-line text field, 40 px tall. Put it inside `<Field>`
 * for its label, help and error; on its own (a search box) give it an `aria-label`. Inside a field,
 * the field's id wins over one passed here, so the label always points at it.
 *
 * `computed` shows a value Orynx works out from another field, read-only: the mono face on the sidebar wash, as
 * Settings › Skills draws Folder name (`skills.html`, spec 023).
 */
export function Input({ className, computed = false, ...props }: ComponentProps<'input'> & { computed?: boolean }) {
  const field = useFieldControl();
  return (
    <input
      data-slot="input"
      readOnly={computed || undefined}
      className={cn(
        'h-10 w-full min-w-0 rounded-sm border border-control bg-raised px-3 text-body text-foreground placeholder:text-placeholder not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
        computed && 'bg-sidebar font-mono text-code hover:border-control',
        className,
      )}
      {...props}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    />
  );
}
