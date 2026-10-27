import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
import { CopyButton } from './copy-button.tsx';
import { Skeleton } from './skeleton.tsx';

export interface ChangedFile {
  /** The file's path in the repository: "src/content/ContentList.tsx". */
  path: string;
  /** Lines added and removed; a count of zero is left out. */
  added: number;
  removed: number;
}

export type FileListProps = Omit<ComponentProps<'ul'>, 'onSelect'> & {
  /** What the list is, for screen readers: "Changed files". */
  'aria-label': string;
  files: readonly ChangedFile[];
  /** The path of the file whose diff is shown. */
  current?: string | undefined;
  /** Called with a file's path when it's picked. The list marks it shown once `current` says so. */
  onSelect: (path: string) => void;
  /**
   * Shows this many rows, then scrolls inside its box (spec 013, Q6c). 8 is the one height a screen uses yet;
   * add another with its class when one needs it.
   */
  maxRows?: 8 | undefined;
};

function lines(count: number, what: 'added' | 'removed'): string {
  return `${String(count)} ${count === 1 ? 'line' : 'lines'} ${what}`;
}

/** The counts as a screen reader hears them: "68 lines added, 9 lines removed" (spec 006 Q5b). */
export function spokenCounts(added: number, removed: number): string {
  return [added > 0 ? lines(added, 'added') : null, removed > 0 ? lines(removed, 'removed') : null]
    .filter((part) => part !== null)
    .join(', ');
}

/** Splits a path into its folder, which may be cut off, and its file name. */
function splitPath(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf('/');
  return { folder: path.slice(0, Math.max(0, slash)), name: path.slice(slash + 1) };
}

/**
 * Design system: FileList (`dh-filelist`). The files Claude changed, with their + and − counts;
 * picking one shows its diff. Each file is a 56 px button; the shown one has `aria-current` and an
 * `info` edge and tint. Its name is mono on the first line, and its folder and counts on the second
 * (spec 048, `session-review.html`); a long folder is cut off and the full path shows on hover. Beside
 * each file, a copy button for its path shows on hover or focus (the user's call, 19 Oct 2026).
 */
export function FileList({ files, current, onSelect, maxRows, className, ...props }: FileListProps) {
  return (
    <ul
      data-slot="file-list"
      className={cn(
        'm-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-md border border-border p-0',
        // 8 rows of 56 px and their 7 dividers are 455 px; at 456 the next row's divider shows the list goes on.
        // Relative, so each row's hidden words are clipped here, not stacked below the page (the user's report, 22 Oct).
        maxRows === 8 && 'relative box-content max-h-114 overflow-y-auto',
        className,
      )}
      {...props}
    >
      {files.map((file) => {
        const { folder, name } = splitPath(file.path);
        const spoken = spokenCounts(file.added, file.removed);
        return (
          // The row takes the shown file's tint, so the copy button beside the file's button sits on it too.
          <li
            key={file.path}
            className="group flex items-center bg-raised pe-1 hover:bg-subtle has-aria-[current=true]:bg-info-subtle"
          >
            <button
              type="button"
              aria-current={file.path === current ? 'true' : undefined}
              onClick={() => {
                onSelect(file.path);
              }}
              className="flex min-h-14 w-full min-w-0 cursor-pointer flex-col justify-center border-0 border-s-2 border-transparent bg-transparent px-3 py-2 text-start text-small text-foreground focus-visible:-outline-offset-2 aria-current:border-info"
            >
              {/* Named by its content: the whole path, then the counts as words. The drawn path and counts
                  aren't read out (the two path parts would read with a gap between them), and the
                  spaces keep the words apart; flex layout ignores them. */}
              <span className="sr-only">{file.path}</span>{' '}
              <span aria-hidden title={file.path} className="flex w-full min-w-0 flex-col">
                <span className="truncate font-mono text-code font-medium">{name}</span>
                <span className="flex min-w-0 gap-2 text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">{folder}</span>
                  {/* Green is 4.14:1 on the shown row's tint, so there the + count is in the text colour; the sign
                      still says it (the user's call, spec 013, 18 Oct 2026). */}
                  {file.added > 0 ? (
                    <span className={file.path === current ? 'text-foreground' : 'text-success'}>+{file.added}</span>
                  ) : null}
                  {file.removed > 0 ? <span className="text-danger">−{file.removed}</span> : null}
                </span>
              </span>
              {spoken ? <span className="sr-only">{spoken}</span> : null}
            </button>
            <CopyButton text={file.path} reveal="hover" />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The list's loading form (spec 006 Q4a): `rows` rows built like the real ones (a divider, then a
 * 56 px row of two lines) in the same frame, so nothing moves when the files arrive. Hidden from screen readers.
 */
export function FileListSkeleton({
  rows = 4,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children'> & { rows?: number }) {
  return (
    <div
      data-slot="file-list-skeleton"
      aria-hidden
      className={cn('flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border', className)}
      {...props}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex">
          <div className="flex h-14 w-full flex-col justify-center gap-1.5 border-s-2 border-s-transparent bg-raised px-3">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
