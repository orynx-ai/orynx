import { useRef, type ReactNode } from 'react';
import {
  BubbleChatIcon,
  Cancel01Icon,
  CheckListIcon,
  Delete02Icon,
  FileSearchIcon,
  GitBranchIcon,
  GitPullRequestIcon,
  PencilEdit01Icon,
  PowerIcon,
  SentIcon,
  StopIcon,
  TerminalIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import type { Session, SessionActivity, SessionStep } from '@devhub/contracts';
import {
  ActivityList,
  ActivityStep,
  Callout,
  Icon,
  Panel,
  Skeleton,
  Stepper,
  type ActivityStepState,
} from '@devhub/ui';
import { durationText } from '../../../words/duration.ts';
import { useNow } from '../../../words/use-now.ts';
import { problemWords, stepWords } from '../step-words.ts';
import { ApprovalCallout } from './approval-callout.tsx';

const steps = ['Plan', 'Build', 'Test', 'Review', 'Pull request'] as const;
const stepIndex: Record<SessionStep, number> = { plan: 0, build: 1, test: 2, review: 3, pull_request: 4 };

/** Where the session is: Plan, Build, Test, Review, Pull request (AC-7). */
export function SessionStepper({ session }: { session: Session }) {
  return <Stepper aria-label="Session progress" steps={steps} current={stepIndex[session.step]} />;
}

const kindIcons = {
  worktree: GitBranchIcon,
  brief: SentIcon,
  explore: FileSearchIcon,
  plan: CheckListIcon,
  edit: PencilEdit01Icon,
  refused: Cancel01Icon,
  waiting: TerminalIcon,
  command: TerminalIcon,
  denied: Cancel01Icon,
  no_commands: TerminalIcon,
  finished: Tick02Icon,
  message: BubbleChatIcon,
  pull_request: GitPullRequestIcon,
  pushed: GitPullRequestIcon,
  stopped: StopIcon,
  interrupted: PowerIcon,
  discarded: Delete02Icon,
} as const;

/** Steps that ended the work, were refused, or are your own message aren't something done, so they keep the plain dot. */
const plainKinds = new Set<SessionActivity['kind']>([
  'message',
  'refused',
  'denied',
  'no_commands',
  'stopped',
  'interrupted',
  'discarded',
]);

function look(activity: SessionActivity): { state: ActivityStepState | undefined; icon: ReactNode } {
  if (activity.state === 'done' && !plainKinds.has(activity.kind)) {
    return { state: 'done', icon: <Icon icon={Tick02Icon} /> };
  }
  // A call waiting for you is amber, with the kind of work it waits to do (spec 012, as session.html draws it).
  if (activity.kind === 'waiting') {
    return { state: 'waiting', icon: <Icon icon={activity.about === 'edit' ? PencilEdit01Icon : TerminalIcon} /> };
  }
  return { state: undefined, icon: <Icon icon={kindIcons[activity.kind]} /> };
}

/** A line that holds a command in backticks, with the command shown as code. */
function withCode(line: string): ReactNode[] {
  return line.split('`').map((part, index) => (index % 2 === 1 ? <code key={part}>{part}</code> : part));
}

/**
 * How long Claude has worked, over its first run and every follow-up (spec 013, Q3): moving each second while
 * a run goes on, and still while Claude waits for you to follow up.
 */
function WorkedFor({ session }: { session: Session }) {
  const { runStartedAt } = session;
  const now = useNow(runStartedAt === null ? 60_000 : 1_000);
  const running = runStartedAt === null ? 0 : Math.max(0, now.getTime() - Date.parse(runStartedAt));
  return <span className="text-small text-muted-foreground">{durationText(session.workedMs + running)}</span>;
}

/**
 * "Claude's progress" (`session.html`): why the session couldn't start when it couldn't, then each step
 * in its words, the latest one still running (AC-4, AC-13), then the follow-up box (spec 013). The box sticks
 * to the window's bottom while the pane is taller than the window (spec 013, Q6b).
 */
export function SessionProgress({ session, footer }: { session: Session; footer?: ReactNode }) {
  const problem = session.problem === null ? null : problemWords(session.problem, session);
  // Focus comes here once you've answered the last call waiting for you (spec 012, AC-18).
  const pane = useRef<HTMLElement>(null);
  return (
    <Panel
      ref={pane}
      tabIndex={-1}
      title="Claude's progress"
      actions={<WorkedFor session={session} />}
      // Clipped without being a scroll box, so the box at its end can stick to the window.
      className="overflow-clip"
    >
      <div className="flex flex-col gap-4 p-4">
        <ApprovalCallout session={session} afterAll={pane} />
        {problem === null ? null : (
          <Callout tone="danger" role="alert" title={problem.title}>
            <span>{withCode(problem.line)}</span>
          </Callout>
        )}
        <ActivityList>
          {session.activities.map((activity) => {
            const words = stepWords(activity);
            const { state, icon } = look(activity);
            return (
              <ActivityStep key={activity.id} state={state} icon={icon} title={words.title} detail={words.detail} />
            );
          })}
        </ActivityList>
        {footer === undefined ? null : (
          // The steps pass under it, on the pane's own colour.
          <div className="sticky bottom-0 -mx-4 -mb-4 bg-raised px-4 pt-2 pb-4">{footer}</div>
        )}
      </div>
    </Panel>
  );
}

/** The stepper while the session loads: its shape, so nothing moves when it arrives (AC-16). */
export function SessionStepperSkeleton() {
  return (
    // Hidden from screen readers, as every skeleton is; the page says it's busy.
    <span aria-hidden className="flex h-6 items-center">
      <Skeleton className="h-4 w-80 max-w-full" />
    </span>
  );
}

/** The pane while the session loads: its shape, so nothing moves when it arrives (AC-16). */
export function SessionProgressSkeleton() {
  return (
    <div aria-hidden>
      <Panel title="Claude's progress">
        <div className="flex flex-col gap-3.5 p-4">
          {[0, 1, 2].map((row) => (
            <span key={row} className="flex gap-3">
              <Skeleton shape="circle" className="size-6" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3.5 w-1/2" />
              </span>
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}
