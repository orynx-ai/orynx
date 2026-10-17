import { useId, type ComponentProps, type KeyboardEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { Button } from './button.tsx';

export type ComposerProps = ComponentProps<'form'>;

/**
 * Design system: Composer (`dh-composer`). The one place to give Claude a task: a text box, the
 * folder and agent pickers, and Send. From AI Elements' Prompt Input pattern (shadcn's
 * `input-group`): the composer is the form, and the focus ring moves from the text box to the whole
 * box, whose border turns `info` while focus is inside it. Hand `onSubmit` the form library's submit
 * handler and spread the text box's `register(...)` onto `ComposerTextarea`.
 */
export function Composer({ className, ...props }: ComposerProps) {
  return (
    <form
      data-slot="composer"
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-raised p-3 shadow-overlay focus-within:border-info has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-info',
        className,
      )}
      {...props}
    />
  );
}

export type ComposerTextareaProps = ComponentProps<'textarea'> & {
  /** Names the text box for screen readers ("Describe a task for Claude"); the placeholder shows what to type. */
  label: string;
};

/** True for the Enter that sends: not with Shift, and not while an input method is composing a word. */
function isSendKey(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  if (event.key !== 'Enter' || event.shiftKey) return false;
  // Safari ends composition before this keydown but still reports key code 229, its only signal.
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- see above
  return !event.nativeEvent.isComposing && event.keyCode !== 229;
}

/** The text box. Enter sends the form; Shift+Enter adds a line. */
export function ComposerTextarea({ label, id, rows = 2, className, onKeyDown, ...props }: ComposerTextareaProps) {
  const madeUpId = useId();
  const boxId = id ?? madeUpId;
  return (
    <>
      <label htmlFor={boxId} className="sr-only">
        {label}
      </label>
      <textarea
        id={boxId}
        data-slot="composer-textarea"
        rows={rows}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || !isSendKey(event)) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        className={cn(
          'min-h-12 w-full resize-none border-0 bg-transparent p-1 text-body text-foreground outline-none placeholder:text-placeholder',
          className,
        )}
        {...props}
      />
    </>
  );
}

/** The row under the text box: + Add context and the pickers at the start, Send at the end. */
export function ComposerBar({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="composer-bar" className={cn('flex flex-wrap items-center gap-2', className)} {...props} />;
}

export type ComposerSendProps = Omit<ComponentProps<'button'>, 'children' | 'type'> & {
  /** What sending does, for screen readers: "Send to Claude". */
  label: string;
};

/** Send: the screen's one primary button, round, 36 px, with an arrow. */
export function ComposerSend({ label, className, ...props }: ComposerSendProps) {
  return (
    <Button
      type="submit"
      variant="primary"
      size="icon"
      aria-label={label}
      className={cn('ms-auto size-9 rounded-full', className)}
      {...props}
    >
      <ArrowUp aria-hidden />
    </Button>
  );
}
