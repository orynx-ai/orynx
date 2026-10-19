import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ChangedFile, Editor, FileDiff, Session } from '@devhub/contracts';
import {
  Button,
  DiffView,
  DiffViewSkeleton,
  EmptyState,
  FileList,
  FileListSkeleton,
  Skeleton,
  type DiffLine,
} from '@devhub/ui';
import {
  binaryLine,
  changesSummary,
  cutLine,
  emptyChanges,
  moreFilesLine,
  renamedLine,
  unreadableLine,
} from '../change-words.ts';
import { useEditor, useSessionChanges, useSessionDiff } from '../queries.ts';

/** "Couldn't read the changes." with Try again, as the sessions list says it couldn't load. */
function Unreadable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 text-small text-muted-foreground">
      <span>{unreadableLine}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** The diff's lines, with git's word on a rename first and the cut last, in the hunk header's look (Q5). */
function linesOf(file: ChangedFile, diff: FileDiff, editor: Editor): DiffLine[] {
  const renamedFrom = file.renamedFrom ?? diff.renamedFrom;
  return [
    ...(renamedFrom === null ? [] : [{ kind: 'hunk' as const, text: renamedLine(renamedFrom) }]),
    ...diff.lines,
    ...(diff.cut ? [{ kind: 'hunk' as const, text: cutLine(editor) }] : []),
  ];
}

function ShownDiff({ session, file, editor }: { session: Session; file: ChangedFile; editor: Editor }) {
  const diff = useSessionDiff(session.id, file.binary ? null : file.path);
  if (file.binary) return <DiffView path={file.path} lines={[{ kind: 'hunk', text: binaryLine }]} />;
  if (diff.isPending) return <DiffViewSkeleton />;
  if (diff.isError) return <Unreadable onRetry={() => void diff.refetch()} />;
  return <DiffView path={file.path} lines={linesOf(file, diff.data, editor)} />;
}

/** The loading form, in the final sizes: the summary line, four file rows and a diff (AC-8). */
export function ChangesSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <span className="flex h-5 items-center">
        <Skeleton className="h-3.5 w-56" />
      </span>
      <FileListSkeleton rows={4} />
      <DiffViewSkeleton />
    </div>
  );
}

/**
 * The Changes tab (spec 013): what differs in the worktree from where its branch started, live while Claude
 * works. The summary line, the files (8 rows, then the list scrolls, Q6c) and the shown file's diff, which is
 * the one the address names or the first. Open in the editor and Discard changes are in the title row.
 */
export function ChangesPanel({ session }: { session: Session }) {
  const changes = useSessionChanges(session.id);
  const editor = useEditor();
  const { file } = useSearch({ from: '/sessions/$sessionId' });
  const navigate = useNavigate({ from: '/sessions/$sessionId' });
  const working = session.state === 'working' || session.state === 'needs_you';
  // Until Settings has answered, the button waits; if it can't answer, VS Code, the default.
  const picked: Editor | null = editor.data ?? (editor.isError ? 'vscode' : null);

  let body;
  if (changes.isPending) {
    body = <ChangesSkeleton />;
  } else if (changes.isError) {
    body = <Unreadable onRetry={() => void changes.refetch()} />;
  } else if (changes.data.state !== 'ready' || changes.data.files.length === 0) {
    const data = changes.data;
    const empty = emptyChanges(
      data.state === 'ready'
        ? { state: 'none_yet' }
        : data.state === 'discarded'
          ? { state: 'discarded', branch: session.branch ?? '' }
          : { state: data.state },
    );
    body = <EmptyState title={empty.title}>{empty.line}</EmptyState>;
  } else {
    const { files, moreFiles, added, removed } = changes.data;
    const shown = files.find((one) => one.path === file) ?? files[0];
    const summary = changesSummary({ added, removed, files: files.length + moreFiles, working });
    body = (
      <>
        <p className="m-0 text-small">
          <span aria-hidden>
            {summary.added === null ? null : <span className="text-success">{summary.added} </span>}
            {summary.removed === null ? null : <span className="text-danger">{summary.removed} </span>}
            <span className="text-muted-foreground">{summary.rest}</span>
          </span>
          <span className="sr-only">{summary.spoken}</span>
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 grow basis-55 flex-col gap-2">
            <FileList
              aria-label="Changed files"
              files={files}
              current={shown?.path}
              maxRows={8}
              onSelect={(path) => {
                void navigate({ search: (search) => ({ ...search, file: path }), replace: true });
              }}
            />
            {moreFiles > 0 ? <p className="m-0 text-small text-muted-foreground">{moreFilesLine(moreFiles)}</p> : null}
          </div>
          <div className="min-w-0 grow-3 basis-105">
            {shown === undefined || picked === null ? (
              <DiffViewSkeleton />
            ) : (
              <ShownDiff session={session} file={shown} editor={picked} />
            )}
          </div>
        </div>
      </>
    );
  }

  return <div className="flex min-w-0 flex-col gap-3">{body}</div>;
}
