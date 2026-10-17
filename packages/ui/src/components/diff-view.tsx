import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { spokenCounts } from './file-list.tsx';

export type DiffLineKind = 'context' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffLineKind;
  /** The line's number: the new file's for added and unchanged lines, the old file's for removed ones. */
  number: number;
  /** The line's code, without its sign. */
  text: string;
}

export type DiffViewProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** The file's path in the repository: "src/content/ContentList.tsx". */
  path: string;
  /** The lines to show, already split; spec 013 turns git's output into them. */
  lines: readonly DiffLine[];
};

const lineVariants = cva('flex min-h-5', {
  variants: {
    kind: { context: '', added: 'bg-success-subtle', removed: 'bg-danger-subtle' },
  },
});

const signVariants = cva('w-4.5 shrink-0 select-none', {
  variants: {
    kind: { context: '', added: 'text-success', removed: 'text-danger' },
  },
});

/** The sign carries the meaning and colour backs it up; a screen reader reads it as it is (spec 006 Q5c). */
const signs: Record<DiffLineKind, string> = { context: ' ', added: '+', removed: '−' };

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Design system: DiffView (`dh-diff`). Claude's changes to one file. From shadcn's `code-block`,
 * without its Shiki highlighter (spec 006 Q6b): mono 14/20, added lines on `success-subtle` with
 * "+", removed lines on `danger-subtle` with "−". A region named after the file, with the path and
 * its counts on top. Wide lines scroll sideways inside the diff (it takes keyboard focus for that),
 * never the page; copying takes only the code, without numbers or signs.
 */
export function DiffView({ path, lines, className, ...props }: DiffViewProps) {
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  const spoken = spokenCounts(added, removed);
  return (
    <div
      data-slot="diff-view"
      role="region"
      aria-label={`Changes in ${fileName(path)}`}
      className={cn('min-w-0 overflow-hidden rounded-md border border-border bg-raised', className)}
      {...props}
    >
      <div className="flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2 font-mono text-code">
        <span title={path} className="min-w-0 flex-1 truncate">
          {path}
        </span>
        <span aria-hidden className="flex shrink-0 gap-2">
          {added > 0 ? <span className="text-success">+{added}</span> : null}
          {removed > 0 ? <span className="text-danger">−{removed}</span> : null}
        </span>
        {spoken ? <span className="sr-only">{spoken}</span> : null}
      </div>
      {/* The code scrolls, which clips anything outside it, so the focus ring is drawn inside. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take keyboard focus (WCAG 2.1.1) */}
      <pre tabIndex={0} className="m-0 overflow-x-auto py-1 font-mono text-code focus-visible:-outline-offset-2">
        <code className="grid min-w-max">
          {lines.map((line, index) => (
            // Lines have no id of their own; their order is fixed for a given diff.
            <span key={index} data-kind={line.kind} className={lineVariants({ kind: line.kind })}>
              <span className="w-11 shrink-0 pe-2 text-end text-muted-foreground select-none">{line.number}</span>
              <span className={signVariants({ kind: line.kind })}>{signs[line.kind]}</span>
              {/* An empty line holds a newline, so copying keeps the blank line. */}
              <span className="pe-3">{line.text === '' ? '\n' : line.text}</span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
