import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { useFieldControl } from './field.tsx';

/**
 * Not in the design system: Input's look (`dh-input`) over several lines, for text that needs them, such as a pull
 * request's description (the user's answer, spec 014 Q10b; from shadcn's textarea). 10 lines show before it
 * scrolls inside, and it can be made taller or shorter. Put it inside `<Field>` for its label, help and error, as
 * Input; inside a field, the field's id wins over one passed here.
 *
 * `mono` draws text Claude reads as written, such as a skill's instructions: the design's `dh-editor` (`skills.html`,
 * spec 023), in the mono face, at least 300 px tall, with spellcheck off.
 */
export function Textarea({
  className,
  rows = 10,
  mono = false,
  ...props
}: ComponentProps<'textarea'> & { mono?: boolean }) {
  const field = useFieldControl();
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      spellCheck={mono ? false : undefined}
      className={cn(
        'block w-full min-w-0 resize-y overflow-y-auto rounded-sm border border-control bg-raised px-3 py-2 text-body text-foreground placeholder:text-placeholder not-aria-invalid:enabled:hover:border-muted-foreground disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger',
        mono && 'min-h-75 p-3 font-mono text-code',
        className,
      )}
      {...props}
      {...(field
        ? { id: field.id, 'aria-describedby': field.describedBy, 'aria-invalid': field.invalid || undefined }
        : {})}
    />
  );
}
