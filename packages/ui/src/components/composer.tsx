import {
  createContext,
  useCallback,
  useContext,
  useId,
  type ComponentProps,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { ArrowUp02Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { cn } from '../lib/cn.ts';
import { IconButton } from './icon-button.tsx';
import { Icon } from './icon.tsx';

/** Home's task box, or the follow-up box on the Session screen. */
export type ComposerLook = 'task' | 'follow-up';

interface ComposerState {
  look: ComposerLook;
  canSend: boolean;
  pending: boolean;
}

const ComposerContext = createContext<ComposerState>({ look: 'task', canSend: true, pending: false });

export type ComposerProps = ComponentProps<'form'> & {
  /**
   * `task` (Home): a shadow, two lines to start, and the primary Send. `follow-up` (Session): no
   * shadow, one line, and a secondary Send, because Create pull request is that screen's primary.
   */
  look?: ComposerLook | undefined;
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
export function Composer({ look = 'task', canSend = true, pending = false, className, ...props }: ComposerProps) {
  return (
    <ComposerContext value={{ look, canSend, pending }}>
      <form
        data-slot="composer"
        className={cn(
          'flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-raised p-3 focus-within:border-info motion-safe:transition-colors',
          look === 'task' && 'shadow-overlay',
          'has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-info',
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
 * Where the browser can't size the text box itself, fits it now and after every form reset (as
 * react-hook-form's `reset()` does after a send), since text set by code fires no input event.
 * Returns what undoes it.
 */
function fitWhenSetByCode(box: HTMLTextAreaElement): () => void {
  if (sizesItself()) return () => undefined;
  fitToText(box);
  const form = box.form;
  // The reset event comes before the form clears its fields, so fit once it has.
  const onReset = () => {
    queueMicrotask(() => {
      fitToText(box);
    });
  };
  form?.addEventListener('reset', onReset);
  return () => {
    form?.removeEventListener('reset', onReset);
  };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * The text box. Enter sends the form; Shift+Enter adds a line. It starts at 2 lines in the task
 * look and 1 in the follow-up look, grows with its text up to 8 lines, then scrolls inside itself
 * (spec 006 Q4d).
 */
export function ComposerTextarea({
  label,
  id,
  rows,
  ref,
  className,
  onKeyDown,
  onInput,
  ...props
}: ComposerTextareaProps) {
  const { look, canSend, pending } = useContext(ComposerContext);
  const madeUpId = useId();
  const boxId = id ?? madeUpId;
  // Keeps the form library's ref (react-hook-form's `register`) working alongside our own.
  const attach = useCallback(
    (box: HTMLTextAreaElement | null) => {
      assignRef(ref, box);
      if (box === null) return undefined;
      const stop = fitWhenSetByCode(box);
      return () => {
        stop();
        assignRef(ref, null);
      };
    },
    [ref],
  );
  return (
    <>
      <label htmlFor={boxId} className="sr-only">
        {label}
      </label>
      <textarea
        id={boxId}
        ref={attach}
        data-slot="composer-textarea"
        rows={rows ?? (look === 'task' ? 2 : 1)}
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
          // field-sizing ignores rows, so the starting height is set here: 2 lines, or 1 in the follow-up box.
          look === 'task' ? 'min-h-14' : 'min-h-8',
          'field-sizing-content max-h-50 w-full resize-none overflow-y-auto border-0 bg-transparent p-1 text-body text-foreground outline-none placeholder:text-placeholder',
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

/** A short line in the bar, such as the follow-up box's keys: "Enter to send · Shift+Enter for a new line". */
export function ComposerHint({ className, ...props }: ComponentProps<'span'>) {
  return <span data-slot="composer-hint" className={cn('text-small text-muted-foreground', className)} {...props} />;
}

export type ComposerSendProps = Omit<ComponentProps<'button'>, 'children' | 'type'> & {
  /** What sending does, for screen readers: "Send to Claude". */
  label: string;
};

/**
 * Send: round, 36 px, with an arrow; the screen's one primary button in the task look, secondary in
 * the follow-up look. When there's nothing to send, or while a send is on its way, it stays
 * focusable but reads as unavailable and ignores presses; while sending, a spinner takes the
 * arrow's place.
 */
export function ComposerSend({ label, className, onClick, ...props }: ComposerSendProps) {
  const { look, canSend, pending } = useContext(ComposerContext);
  const unavailable = !canSend || pending;
  return (
    <IconButton
      type="submit"
      variant={look === 'task' ? 'primary' : 'secondary'}
      label={label}
      aria-disabled={unavailable || undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (unavailable) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cn('ms-auto size-9 rounded-full', className)}
      {...props}
    >
      {pending ? (
        <Icon icon={Loading03Icon} aria-hidden className="motion-safe:animate-spin" />
      ) : (
        <Icon icon={ArrowUp02Icon} aria-hidden />
      )}
    </IconButton>
  );
}
