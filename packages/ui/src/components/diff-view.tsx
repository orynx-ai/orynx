import { useId, type ComponentProps, type ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.ts';
import { CopyButton } from './copy-button.tsx';
import { spokenCounts } from './file-list.tsx';
import { Skeleton } from './skeleton.tsx';

export type DiffLineKind = 'context' | 'added' | 'removed';

/** One line of code, or the header that starts a hunk (`@@ -40,6 +40,8 @@`). */
export type DiffLine =
  | {
      kind: DiffLineKind;
      /** The line's number: the new file's for added and unchanged lines, the old file's for removed ones. */
      number: number;
      /** The line's code, without its sign. */
      text: string;
    }
  | { kind: 'hunk'; text: string };

export type DiffViewProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** The file's path in the repository: "src/content/ContentList.tsx". */
  path: string;
  /** The lines to show, already split; spec 013 turns git's output into them. */
  lines: readonly DiffLine[];
  /** Wide lines wrap under their own code, beside their number, instead of scrolling sideways (spec 048). */
  wrap?: boolean;
  /** At the header's end, after the counts: the New file pill and Viewed (spec 048). */
  actions?: ReactNode;
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
 * its counts on top. Wide lines scroll sideways inside the diff (it takes keyboard focus for that), or wrap with `wrap`
 * (spec 048), never the page; copying takes only the code, without numbers or signs.
 */
export function DiffView({ path, lines, wrap = false, actions, className, ...props }: DiffViewProps) {
  const added = lines.filter((line) => line.kind === 'added').length;
  const removed = lines.filter((line) => line.kind === 'removed').length;
  const spoken = spokenCounts(added, removed);
  const pathId = useId();
  const textClass = cn('pe-3', wrap && 'min-w-0 wrap-anywhere whitespace-pre-wrap');
  return (
    <div
      data-slot="diff-view"
      role="region"
      aria-label={`Changes in ${fileName(path)}`}
      // Relative, so the header's hidden words are clipped here, not by the page.
      className={cn('relative min-w-0 overflow-hidden rounded-md border border-border bg-raised', className)}
      {...props}
    >
      <div className="group flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2 font-mono text-code">
        <span id={pathId} title={path} className="min-w-0 truncate">
          <span className="text-muted-foreground">{path.slice(0, path.lastIndexOf('/') + 1)}</span>
          <span className="font-medium">{fileName(path)}</span>
        </span>
        {/* As tall as the path's line, so the header keeps its height (the user's call, 19 Oct 2026). */}
        <CopyButton text={path} reveal="hover" className="-my-1.5 me-auto" />
        <span aria-hidden className="flex shrink-0 gap-2">
          {added > 0 ? <span className="text-success">+{added}</span> : null}
          {removed > 0 ? <span className="text-danger">−{removed}</span> : null}
        </span>
        {spoken ? <span className="sr-only">{spoken}</span> : null}
        {actions === undefined ? null : (
          <span className="flex shrink-0 items-center gap-2 font-sans text-small">{actions}</span>
        )}
      </div>
      {/* The code scrolls, which clips anything outside it, so the focus ring is drawn inside. */}
      <pre
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take keyboard focus (WCAG 2.1.1)
        tabIndex={0}
        aria-labelledby={pathId}
        className="m-0 overflow-x-auto py-1 font-mono text-code focus-visible:-outline-offset-2"
      >
        <code className={cn('grid', wrap ? 'min-w-0' : 'min-w-max')}>
          {lines.map((line, index) =>
            // Lines have no id of their own; their order is fixed for a given diff.
            line.kind === 'hunk' ? (
              // The gap between hunks (spec 006 Q4c): the header in the code's column, left out of a copy.
              <span key={index} data-kind="hunk" className="flex min-h-5 bg-sidebar text-muted-foreground select-none">
                <span className="w-15.5 shrink-0" />
                <span className={textClass}>{line.text}</span>
              </span>
            ) : (
              <span key={index} data-kind={line.kind} className={lineVariants({ kind: line.kind })}>
                <span className="w-11 shrink-0 pe-2 text-end text-muted-foreground select-none">{line.number}</span>
                <span className={signVariants({ kind: line.kind })}>{signs[line.kind]}</span>
                {/* An empty line holds a newline, so copying keeps the blank line. */}
                <span className={textClass}>{line.text === '' ? '\n' : line.text}</span>
              </span>
            ),
          )}
        </code>
      </pre>
    </div>
  );
}

/** Line widths for the loading form, so it reads as code rather than as a block. */
const sketchWidths = ['w-3/5', 'w-4/5', 'w-2/5', 'w-11/12', 'w-1/2', 'w-3/4', 'w-1/3', 'w-2/3'];

/**
 * The diff's loading form (spec 006 Q4a): the same frame, header and 20 px lines, so nothing moves
 * when the diff arrives. Hidden from screen readers.
 */
export function DiffViewSkeleton({
  lines = 8,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { lines?: number }) {
  return (
    <div
      data-slot="diff-view-skeleton"
      aria-hidden
      // Relative, so the header's hidden words are clipped here, not by the page.
      className={cn('relative min-w-0 overflow-hidden rounded-md border border-border bg-raised', className)}
      {...props}
    >
      {/* The header's padding and one 20 px line, as in the real header. */}
      <div className="flex items-center gap-2 border-b border-border bg-sidebar px-3 py-2">
        <span className="flex h-5 flex-1 items-center">
          <Skeleton className="h-3.5 w-1/2" />
        </span>
        <Skeleton className="h-3.5 w-12" />
      </div>
      <div className="py-1">
        {Array.from({ length: lines }, (_, line) => (
          <div key={line} className="flex h-5 items-center">
            <span className="w-15.5 shrink-0" />
            <Skeleton className={cn('h-3', sketchWidths[line % sketchWidths.length])} />
          </div>
        ))}
      </div>
    </div>
  );
}
