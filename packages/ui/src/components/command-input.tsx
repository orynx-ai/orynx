import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type CommandInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** The field's name, for screen readers only: "Command". */
  label: string;
  /** Shown at the end from 640 px: "↑ history · Enter to run". */
  hint?: ReactNode;
  /** The commands you ran, oldest first, which ↑ and ↓ walk (spec 036, AC-12). */
  history?: readonly string[];
  /** Puts a command from the history in the field, through the form's own setter; ↓ past the newest gives "". */
  onRecall?: (command: string) => void;
  /** ⌃C with nothing selected: stop what runs (AC-9). With text selected it's left alone, for copying. */
  onInterrupt?: () => void;
};

/**
 * The Terminal's command line (spec 036, `dh-term-input`): a prompt, the field in mono and a hint, under a
 * hairline. The form owns the value; this keeps only where ↑ has got to in the history.
 */
export function CommandInput({
  label,
  hint,
  history = [],
  onRecall,
  onInterrupt,
  onKeyDown,
  className,
  id,
  ...props
}: CommandInputProps) {
  const ownId = useId();
  const fieldId = id ?? ownId;
  /** Where ↑ has got to: -1 is the field you're typing in, past the newest command. */
  const [place, setPlace] = useState(-1);
  // A new command joins the history once one runs: ↑ starts from the newest again.
  const [length, setLength] = useState(history.length);
  if (length !== history.length) {
    setLength(history.length);
    setPlace(-1);
  }

  function recall(to: number) {
    setPlace(to);
    onRecall?.(to < 0 ? '' : (history[to] ?? ''));
  }

  return (
    <div className={cn('flex items-center gap-2 border-t border-border px-3.5 py-2', className)}>
      <span aria-hidden className="font-mono text-code text-success">
        ❯
      </span>
      <label htmlFor={fieldId} className="sr-only">
        {label}
      </label>
      <input
        id={fieldId}
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-code text-foreground placeholder:text-placeholder"
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          const field = event.currentTarget;
          if (event.key === 'ArrowUp' && history.length > 0) {
            event.preventDefault();
            recall(place < 0 ? history.length - 1 : Math.max(0, place - 1));
          } else if (event.key === 'ArrowDown' && place >= 0) {
            event.preventDefault();
            recall(place + 1 >= history.length ? -1 : place + 1);
          } else if (event.ctrlKey && event.key === 'c' && field.selectionStart === field.selectionEnd) {
            event.preventDefault();
            onInterrupt?.();
          }
        }}
        {...props}
      />
      {hint === undefined ? null : (
        <span className="hidden text-label whitespace-nowrap text-muted-foreground sm:inline">{hint}</span>
      )}
    </div>
  );
}
