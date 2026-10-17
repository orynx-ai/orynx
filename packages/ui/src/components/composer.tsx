import { createContext, useContext, useId, type ComponentProps, type KeyboardEvent } from 'react';
import { ArrowUp, LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { Button } from './button.tsx';

interface ComposerState {
  canSend: boolean;
  pending: boolean;
}

const ComposerContext = createContext<ComposerState>({ canSend: true, pending: false });

export type ComposerProps = ComponentProps<'form'> & {
  /**
   * False when there's nothing to send: Send stays focusable but reads as unavailable, and Enter
   * sends nothing. Pass true with an empty box when something else can be sent (a ticket chip).
   */
  canSend?: boolean | undefined;
  /** True while a send is on its way: Send shows its spinner and ignores presses; the text stays. */
  pending?: boolean | undefined;
};

/**
 * Design system: Composer (`dh-composer`). The one place to give Claude a task: a text box, the
 * folder and agent pickers, and Send. From AI Elements' Prompt Input pattern (shadcn's
 * `input-group`): the composer is the form, and the focus ring moves from the text box to the whole
 * box, whose border turns `info` while focus is inside it. Hand `onSubmit` the form library's submit
 * handler and spread the text box's `register(...)` onto `ComposerTextarea`.
 */
export function Composer({ canSend = true, pending = false, className, ...props }: ComposerProps) {
  return (
    <ComposerContext value={{ canSend, pending }}>
      <form
        data-slot="composer"
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-raised p-3 shadow-overlay focus-within:border-info has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-info',
          className,
        )}
        {...props}
      />
    </ComposerContext>
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

/** 8 lines of 24 px and the 4 px padding above and below: past it, the text box scrolls. */
const MAX_HEIGHT = 200;

/** Sizes the text box to its text, for browsers without CSS `field-sizing` (Firefox, older Safari). */
function fitToText(box: HTMLTextAreaElement): void {
  box.style.height = 'auto';
  box.style.height = `${String(Math.min(box.scrollHeight, MAX_HEIGHT))}px`;
}

function sizesItself(): boolean {
  return typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');
}

/**
 * The text box. Enter sends the form; Shift+Enter adds a line. It grows with its text up to 8
 * lines, then scrolls inside itself (spec 006 Q4d).
 */
export function ComposerTextarea({
  label,
  id,
  rows = 2,
  className,
  onKeyDown,
  onInput,
  ...props
}: ComposerTextareaProps) {
  const { canSend, pending } = useContext(ComposerContext);
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
          if (canSend && !pending) event.currentTarget.form?.requestSubmit();
        }}
        onInput={(event) => {
          onInput?.(event);
          if (!sizesItself()) fitToText(event.currentTarget);
        }}
        className={cn(
          'field-sizing-content max-h-50 min-h-12 w-full resize-none overflow-y-auto border-0 bg-transparent p-1 text-body text-foreground outline-none placeholder:text-placeholder',
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

/**
 * Send: the screen's one primary button, round, 36 px, with an arrow. When there's nothing to send,
 * or while a send is on its way, it stays focusable but reads as unavailable and ignores presses;
 * while sending, a spinner takes the arrow's place.
 */
export function ComposerSend({ label, className, onClick, ...props }: ComposerSendProps) {
  const { canSend, pending } = useContext(ComposerContext);
  const unavailable = !canSend || pending;
  return (
    <Button
      type="submit"
      variant="primary"
      size="icon"
      aria-label={label}
      aria-disabled={unavailable || undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (unavailable) event.preventDefault();
      }}
      className={cn('ms-auto size-9 rounded-full', className)}
      {...props}
    >
      {pending ? <LoaderCircle aria-hidden className="motion-safe:animate-spin" /> : <ArrowUp aria-hidden />}
    </Button>
  );
}
