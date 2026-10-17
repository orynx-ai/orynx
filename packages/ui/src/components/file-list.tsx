import type { ComponentProps } from 'react';
import { cn } from '../lib/cn.ts';
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

/** Splits a path into its folder part, which may be cut off, and its file name, which stays whole. */
function splitPath(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf('/');
  return { folder: path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/**
 * Design system: FileList (`dh-filelist`). The files Claude changed, with their + and − counts;
 * picking one shows its diff. Each file is a 40 px button; the shown one has `aria-current` and an
 * `info` edge and tint. The path is mono; when it's too long, only the folder part is cut off, so
 * the file name stays whole (spec 006 Q3b), and the full path shows on hover.
 */
export function FileList({ files, current, onSelect, className, ...props }: FileListProps) {
  return (
    <ul
      data-slot="file-list"
      className={cn(
        'm-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-md border border-border p-0',
        className,
      )}
      {...props}
    >
      {files.map((file) => {
        const { folder, name } = splitPath(file.path);
        const spoken = spokenCounts(file.added, file.removed);
        return (
          <li key={file.path} className="flex">
            <button
              type="button"
              title={file.path}
              // The path as shown, then the counts as words; the drawn "+68 −9" isn't read out.
              aria-label={spoken ? `${file.path} ${spoken}` : file.path}
              aria-current={file.path === current ? 'true' : undefined}
              onClick={() => {
                onSelect(file.path);
              }}
              className="flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2 border-0 border-s-2 border-transparent bg-raised px-3 text-start text-small text-foreground hover:bg-subtle focus-visible:-outline-offset-2 aria-current:border-info aria-current:bg-info-subtle"
            >
              <span className="flex min-w-0 flex-1 font-mono text-code">
                <span className="min-w-0 truncate">{folder}</span>
                {/* Never shrinks, so the folder gives way first; cut only when the name alone is too wide. */}
                <span className="max-w-full shrink-0 truncate">{name}</span>
              </span>
              <span aria-hidden className="flex shrink-0 gap-2">
                {file.added > 0 ? <span className="text-success">+{file.added}</span> : null}
                {file.removed > 0 ? <span className="text-danger">−{file.removed}</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The list's loading form (spec 006 Q4a): `rows` 40 px rows in the same frame, so nothing moves
 * when the files arrive. Hidden from screen readers.
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
        <div key={row} className="flex h-10 items-center gap-2 border-s-2 border-transparent bg-raised px-3">
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}
