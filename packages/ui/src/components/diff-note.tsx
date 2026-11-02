import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type DiffNoteProps = Omit<ComponentProps<'article'>, 'title'> & {
  /** Who wrote it, before the name: an `Avatar`, or an agent's icon. Hidden from screen readers; the name says it. */
  mark: ReactNode;
  /** "Priya Shah", "Claude". */
  author: string;
  /** Quieter, after the name: "reviewed · 5 days ago", "Posted". */
  meta?: ReactNode;
  /** The note's words, or the box that edits them. */
  children: ReactNode;
  /** Across the foot of the note: what you can do with it (Keep, Edit), or a line such as "Fixed by Claude". */
  footer?: ReactNode;
  /** `success`: the design's "Fixed by Claude" band. */
  footerTone?: 'plain' | 'success';
  /** A note that won't be posted: its words fade, its footer doesn't. */
  muted?: boolean;
};

/**
 * Design system: a note under a line of a diff (`session-review.html`, the reviewer's note; spec 050): a raised,
 * bordered box with who wrote it, the words, and a footer. Name it with `aria-label` ("Claude on line 42").
 */
export function DiffNote({
  mark,
  author,
  meta,
  children,
  footer,
  footerTone = 'plain',
  muted = false,
  className,
  ...props
}: DiffNoteProps) {
  return (
    <article
      className={cn('overflow-hidden rounded-md border border-border bg-raised font-sans text-small', className)}
      {...props}
    >
      <div className={cn('flex gap-2.5 px-3 py-2.5', muted && 'text-muted-foreground')}>
        <span aria-hidden className="shrink-0">
          {mark}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p>
            <span className="font-medium">{author}</span>
            {meta === undefined ? null : <span className="text-muted-foreground"> {meta}</span>}
          </p>
          <div className="break-words">{children}</div>
        </div>
      </div>
      {footer === undefined ? null : (
        <div
          className={cn(
            'flex flex-wrap items-center gap-2 border-t border-border px-3 py-2',
            footerTone === 'success' && 'bg-success-subtle',
          )}
        >
          {footer}
        </div>
      )}
    </article>
  );
}
