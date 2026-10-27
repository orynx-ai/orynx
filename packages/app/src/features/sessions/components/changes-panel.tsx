import { useId } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ChangedFile, Editor, FileDiff, Session } from '@devhub/contracts';
import {
  Button,
  CheckboxBox,
  DiffView,
  DiffViewSkeleton,
  EmptyState,
  FileList,
  FileListSkeleton,
  Pill,
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
import { isViewed, useDiffView } from '../store.ts';

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

/** Viewed, ticked by you and kept in this browser until Claude changes the file again (spec 048, AC-22). */
function Viewed({ sessionId, file }: { sessionId: string; file: ChangedFile }) {
  const viewed = useDiffView((state) => isViewed(state, sessionId, file));
  const setViewed = useDiffView((state) => state.setViewed);
  const id = useId();
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <CheckboxBox
        id={id}
        checked={viewed}
        onCheckedChange={(checked) => {
          setViewed(sessionId, file, checked === true);
        }}
      />
      <label htmlFor={id}>Viewed</label>
    </span>
  );
}

function ShownDiff({ session, file, editor }: { session: Session; file: ChangedFile; editor: Editor }) {
  const diff = useSessionDiff(session.id, file.binary ? null : file.path);
  const wrap = useDiffView((state) => state.wrap);
  const actions = (
    <>
      {file.created === true ? <Pill tone="success">New file</Pill> : null}
      <Viewed sessionId={session.id} file={file} />
    </>
  );
  if (file.binary) return <DiffView path={file.path} lines={[{ kind: 'hunk', text: binaryLine }]} actions={actions} />;
  if (diff.isPending) return <DiffViewSkeleton />;
  if (diff.isError) return <Unreadable onRetry={() => void diff.refetch()} />;
  return <DiffView path={file.path} lines={linesOf(file, diff.data, editor)} wrap={wrap} actions={actions} />;
}

/** The Changes tab's totals, "+142 −18", and Wrap lines, at the end of the tabs' row (spec 048, AC-18). */
export function ChangesTools({ sessionId }: { sessionId: string }) {
  const changes = useSessionChanges(sessionId);
  const wrap = useDiffView((state) => state.wrap);
  const setWrap = useDiffView((state) => state.setWrap);
  if (changes.data?.state !== 'ready' || changes.data.files.length === 0) return null;
  const { added, removed, files, moreFiles } = changes.data;
  const summary = changesSummary({ added, removed, files: files.length + moreFiles });
  return (
    <span className="ms-auto flex shrink-0 items-center gap-2">
      <span className="shrink-0 text-small">
        <span aria-hidden>
          {summary.added === null ? null : <span className="text-success">{summary.added} </span>}
          {summary.removed === null ? null : <span className="text-danger">{summary.removed}</span>}
        </span>
        <span className="sr-only">{summary.spoken}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={wrap}
        onClick={() => {
          setWrap(!wrap);
        }}
      >
        Wrap lines
      </Button>
    </span>
  );
}

/** The loading form, in the final sizes: four file rows and a diff, beside each other where there's room (AC-8). */
export function ChangesSkeleton() {
  return (
    <div aria-hidden className="@container">
      <div className="flex flex-col gap-3 @xl:flex-row @xl:items-start">
        <FileListSkeleton rows={4} className="@xl:w-60 @xl:shrink-0" />
        <DiffViewSkeleton className="min-w-0 flex-1" />
      </div>
    </div>
  );
}

/**
 * The Changes tab (spec 013): what differs in the worktree from where its branch started, live while Claude
 * works. The files (8 rows, then the list scrolls, Q6c), a column beside the diff where there's room (spec 048), and
 * the shown file's diff, which is the one the address names or the first. The totals and Wrap lines are in the tabs'
 * row ({@link ChangesTools}); Open in the editor and Discard changes are in the page bar's More actions.
 */
export function ChangesPanel({ session }: { session: Session }) {
  const changes = useSessionChanges(session.id);
  const editor = useEditor();
  const { file } = useSearch({ from: '/sessions/$sessionId' });
  const navigate = useNavigate({ from: '/sessions/$sessionId' });
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
    const { files, moreFiles } = changes.data;
    const shown = files.find((one) => one.path === file) ?? files[0];
    body = (
      // A container, so the files sit beside the diff once the tab is wide enough, and above it until then.
      <div className="@container">
        <div className="flex flex-col gap-3 @xl:flex-row @xl:items-start">
          <div className="flex min-w-0 flex-col gap-2 @xl:w-60 @xl:shrink-0">
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
          <div className="min-w-0 flex-1">
            {shown === undefined || picked === null ? (
              <DiffViewSkeleton />
            ) : (
              <ShownDiff session={session} file={shown} editor={picked} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return <div className="flex min-w-0 flex-col gap-3">{body}</div>;
}
