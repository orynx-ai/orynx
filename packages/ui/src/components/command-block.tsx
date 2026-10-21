import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type CommandBlockTone = 'success' | 'danger' | 'warning' | 'neutral';

export type CommandBlockProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** The command as typed. The head shows it on one line, its whole text as a tooltip. */
  command: string;
  /** Beside the command, such as a `Pill` naming Claude. */
  badge?: ReactNode;
  /** How it went, with its mark: "✓ 0.1s", "✗ exit 1 · 3.1s", "● running"; left out when that isn't known. */
  status?: string;
  /** The status's colour; `danger` also outlines the block. */
  tone: CommandBlockTone;
  /** Buttons at the head's end, such as Rerun and Copy; on a narrow window they wrap under the command. */
  actions?: ReactNode;
  /** A line above the output, such as "Showing the last 2,000 lines." */
  note?: ReactNode;
  /** The output, line by line; left out, there's no output box. */
  output?: readonly string[] | undefined;
  /** What sits under the head, such as an approval's choices. */
  children?: ReactNode;
};

const toneClass: Record<CommandBlockTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-muted-foreground',
};

/**
 * One command in a session's Terminal (spec 036, `dh-term-block`): a head on the sidebar's tint with the command in
 * mono after a `$`, a badge, how it went and its actions, then its output as the command printed it. Drawn with the
 * theme's tokens, so it follows light and dark (Q5). A group named by its command, so a screen reader can tell blocks
 * apart. The words come from the caller.
 */
export function CommandBlock({
  command,
  badge,
  status,
  tone,
  actions,
  note,
  output,
  children,
  className,
  ...props
}: CommandBlockProps) {
  return (
    // overflow-hidden drops its minimum height to 0, so without shrink-0 a scrolling column squashes it to a sliver.
    <div
      role="group"
      aria-label={command}
      className={cn(
        'shrink-0 overflow-hidden rounded-md border',
        tone === 'danger' ? 'border-danger' : 'border-border',
        className,
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-sidebar px-2.5 py-1">
        <code title={command} className="min-w-0 flex-1 basis-40 truncate font-mono text-code">
          <span aria-hidden className="text-muted-foreground">
            ${' '}
          </span>
          {command}
        </code>
        {badge}
        {status === undefined ? null : (
          <span className={cn('text-label whitespace-nowrap', toneClass[tone])}>{status}</span>
        )}
        {actions === undefined ? null : <div className="flex flex-wrap items-center gap-1">{actions}</div>}
      </div>
      {note === undefined ? null : <p className="px-2.5 pt-2 text-label text-muted-foreground">{note}</p>}
      {output === undefined || output.length === 0 ? null : (
        <pre className="px-2.5 py-2 font-mono text-code break-words whitespace-pre-wrap">{output.join('\n')}</pre>
      )}
      {children === undefined ? null : (
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 text-small">{children}</div>
      )}
    </div>
  );
}
