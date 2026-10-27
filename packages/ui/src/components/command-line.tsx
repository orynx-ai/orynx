import { useState, type ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';

export type CommandLineProps = Omit<ComponentProps<'button'>, 'children' | 'onClick' | 'type'> & {
  /** The command as Claude ran it. */
  command: string;
  /** Starts in full. */
  defaultOpen?: boolean;
};

/**
 * A command in What Claude did (spec 048, `session-review.html`): one line, cut, in a mono box on the sidebar's tint. A
 * press shows it in full, wrapped, and another cuts it again. Named by the command; `aria-expanded` says which.
 */
export function CommandLine({ command, defaultOpen = false, className, ...props }: CommandLineProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => {
        setOpen(!open);
      }}
      className={cn(
        'block w-full cursor-pointer rounded-sm border border-border bg-sidebar px-2 py-1 text-start font-mono text-code text-foreground',
        open ? 'wrap-anywhere whitespace-pre-wrap' : 'truncate',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="text-muted-foreground">
        ${' '}
      </span>
      {command}
    </button>
  );
}
