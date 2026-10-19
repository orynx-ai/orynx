import { useEffect, useRef, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight01Icon, StopIcon } from '@hugeicons/core-free-icons';
import type { Session, SessionState } from '@devhub/contracts';
import { Button, Icon, Pill, Skeleton, sessionStateLabels, type PillTone } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { usePlatform } from '../../../platform.tsx';
import { needsApprovalLabel } from '../approval-words.ts';
import { editorLink, openInLabel } from '../change-words.ts';
import { openPullRequestLabel } from '../pull-request-words.ts';
import { useEditor, useSessionChanges } from '../queries.ts';
import { CreatePullRequest } from './create-pull-request.tsx';
import { DiscardSession } from './discard-session.tsx';
import { PushChanges } from './push-changes.tsx';

/** The state pill's colour, as the sidebar colours each state (Q10b). */
const stateTones: Record<SessionState, PillTone> = {
  working: 'info',
  needs_you: 'warning',
  done: 'success',
  pr_open: 'neutral',
  stopped: 'neutral',
};

/**
 * Create pull request shows once Claude isn't working, while the worktree is there and no pull request is open
 * (spec 014, Q2): Done, or Stopped after Stop, an error or Orynx closing.
 */
function canCreatePullRequest(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.pullRequest === null && session.discardedAt === null && session.worktreePath !== null;
}

/** Push changes shows once a pull request is open, whenever Claude isn't working and the worktree is there (Q7). */
function canPush(session: Session): boolean {
  const working = session.state === 'working' || session.state === 'needs_you';
  return !working && session.discardedAt === null && session.worktreePath !== null;
}

/**
 * Whether the worktree holds anything a pull request could take: a file that differs from where the branch
 * started. Not known yet, or not readable, is no (the user's call, 19 Oct 2026: no Create pull request for nothing).
 */
function useHasChanges(sessionId: string): boolean {
  const changes = useSessionChanges(sessionId);
  return changes.data?.state === 'ready' && changes.data.files.length + changes.data.moreFiles > 0;
}

/** Open in the editor Settings picks, VS Code until Settings answers otherwise (spec 013, Q9). */
function OpenInEditor({ session }: { session: Session }) {
  const editor = useEditor();
  const picked = editor.data ?? (editor.isError ? 'vscode' : null);
  if (picked === null || session.worktreePath === null || session.discardedAt !== null) return null;
  return (
    <Button asChild variant="secondary">
      <a href={editorLink(picked, session.worktreePath)}>{openInLabel(picked)}</a>
    </Button>
  );
}

/**
 * The Session screen's title row (`session.html`): the title, the state, the branch and where Claude works,
 * with Stop Claude while it works (AC-9). Stop keeps focus while it runs; once the session has stopped, the
 * title takes focus, because the button is gone. Once Claude is done, Create pull request when there's something
 * to put in one; once the pull request is open, Open PR and Push changes, with no primary button (spec 014,
 * Q10e). Open in the editor and Discard changes are here too, at hand from the top (the user's call, 19 Oct 2026).
 */
export function SessionHeader({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  const platform = usePlatform();
  // Once you've created the pull request, focus goes to Open PR, now or as soon as it shows (spec 014, AC-4).
  const justOpened = useRef(false);
  const openPullRequest = useRef<HTMLAnchorElement>(null);
  const { pullRequest } = session;
  useEffect(() => {
    if (pullRequest === null || !justOpened.current) return;
    justOpened.current = false;
    openPullRequest.current?.focus();
  }, [pullRequest]);
  const api = useApi();
  const stop = useMutation({ mutationFn: () => api.stopSession(session.id) });
  const working = session.state === 'working' || session.state === 'needs_you';
  const stopping = stop.isPending || (stop.isSuccess && working);
  const hasChanges = useHasChanges(session.id);

  useEffect(() => {
    if (stop.isSuccess && !working) title.current?.focus();
  }, [stop.isSuccess, working, title]);

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-1 basis-90 flex-col gap-1.5">
        <h1 ref={title} tabIndex={-1} className="m-0 text-title-lg font-medium">
          {session.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
          <Pill tone={stateTones[session.state]}>
            {/* The sidebar's "Needs you" is said in full here, where you answer (spec 012, Q8d). */}
            {session.state === 'needs_you' ? needsApprovalLabel : sessionStateLabels[session.state]}
          </Pill>
          {session.branch === null ? null : (
            <code className="rounded-sm bg-subtle px-2 font-mono text-code text-foreground">{session.branch}</code>
          )}
          {session.mode === 'ask' ? (
            <span>Ask session · reads {session.folder.name} in place and changes nothing</span>
          ) : (
            <span>in {session.folder.name} · separate worktree, your main checkout is untouched</span>
          )}
        </div>
      </div>
      <CreatePullRequest
        session={session}
        show={canCreatePullRequest(session) && hasChanges}
        onOpened={() => {
          if (openPullRequest.current === null) justOpened.current = true;
          else openPullRequest.current.focus();
        }}
      />
      {pullRequest === null ? null : (
        <Button asChild variant="secondary">
          <a
            ref={openPullRequest}
            href={pullRequest.url}
            rel="noreferrer"
            onClick={(event) => {
              event.preventDefault();
              platform.openExternal(pullRequest.url);
            }}
          >
            {openPullRequestLabel(pullRequest.number)}
            <Icon icon={ArrowUpRight01Icon} aria-hidden />
          </a>
        </Button>
      )}
      {pullRequest !== null && canPush(session) ? (
        <PushChanges session={session} repository={pullRequest.repository} />
      ) : null}
      {/* An Ask session has no worktree to open or discard (spec 026). */}
      {session.mode === 'ask' ? null : (
        <>
          <OpenInEditor session={session} />
          <DiscardSession session={session} title={title} />
        </>
      )}
      {working ? (
        <Button
          variant="secondary"
          pending={stopping}
          onClick={() => {
            stop.mutate();
          }}
        >
          {stopping ? null : <Icon icon={StopIcon} aria-hidden />}
          {stopping ? 'Stopping…' : 'Stop Claude'}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The title row's loading form: the same lines, and the button Claude's state offers (Stop Claude, Create pull
 * request or Open PR), wrapping under them on a narrow window as it does, so nothing moves when the session
 * arrives (AC-16; spec 014, AC-23).
 */
export function SessionHeaderSkeleton() {
  return (
    <div aria-hidden className="flex flex-wrap items-start gap-3">
      <div className="flex min-w-0 flex-1 basis-90 flex-col gap-1.5">
        <span className="flex h-7 items-center">
          <Skeleton className="h-5 w-2/3" />
        </span>
        <span className="flex h-6 items-center">
          <Skeleton className="h-4 w-1/2" />
        </span>
      </div>
      <Skeleton className="h-10 w-44" />
    </div>
  );
}
