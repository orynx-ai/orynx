import { useEffect, type RefObject } from 'react';
import { useMutation } from '@tanstack/react-query';
import { StopIcon } from '@hugeicons/core-free-icons';
import type { Session, SessionState } from '@devhub/contracts';
import { Button, Icon, Pill, Skeleton, sessionStateLabels, type PillTone } from '@devhub/ui';
import { useApi } from '../../../api.tsx';
import { needsApprovalLabel } from '../approval-words.ts';
import { CreatePullRequest } from './create-pull-request.tsx';

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

/**
 * The Session screen's title row (`session.html`): the title, the state, the branch and where Claude works,
 * with Stop Claude while it works (AC-9). Stop keeps focus while it runs; once the session has stopped, the
 * title takes focus, because the button is gone.
 */
export function SessionHeader({ session, title }: { session: Session; title: RefObject<HTMLHeadingElement | null> }) {
  const api = useApi();
  const stop = useMutation({ mutationFn: () => api.stopSession(session.id) });
  const working = session.state === 'working' || session.state === 'needs_you';
  const stopping = stop.isPending || (stop.isSuccess && working);

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
          <span>in {session.folder.name} · separate worktree, your main checkout is untouched</span>
        </div>
      </div>
      {canCreatePullRequest(session) ? (
        <CreatePullRequest
          session={session}
          onOpened={() => {
            title.current?.focus();
          }}
        />
      ) : null}
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

/** The title row's loading form: the same lines, so nothing moves when the session arrives (AC-16). */
export function SessionHeaderSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <span className="flex h-7 items-center">
        <Skeleton className="h-5 w-2/3" />
      </span>
      <span className="flex h-6 items-center">
        <Skeleton className="h-4 w-1/2" />
      </span>
    </div>
  );
}
