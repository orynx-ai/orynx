import { useRef, type ReactNode } from 'react';
import {
  AlertCircleIcon,
  Cancel01Icon,
  CheckListIcon,
  Delete02Icon,
  FileSearchIcon,
  GitBranchIcon,
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
  waiting: AlertCircleIcon,
  command: TerminalIcon,
  denied: Cancel01Icon,
  no_commands: TerminalIcon,
  finished: Tick02Icon,
  stopped: StopIcon,
  interrupted: PowerIcon,
  discarded: Delete02Icon,
} as const;

/** Steps that ended the work or were refused aren't something done, so they keep the plain dot. */
const plainKinds = new Set<SessionActivity['kind']>([
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
  return { state: undefined, icon: <Icon icon={kindIcons[activity.kind]} /> };
}

/** A line that holds a command in backticks, with the command shown as code. */
function withCode(line: string): ReactNode[] {
  return line.split('`').map((part, index) => (index % 2 === 1 ? <code key={part}>{part}</code> : part));
}

/** How long Claude has worked: to now while it works, moving each second, and to its end once it ended. */
function WorkedFor({ session }: { session: Session }) {
  const working = session.endedAt === null;
  const now = useNow(working ? 1_000 : 60_000);
  const end = session.endedAt === null ? now.getTime() : Date.parse(session.endedAt);
  return <span className="text-small text-muted-foreground">{durationText(end - Date.parse(session.startedAt))}</span>;
}

/**
 * "Claude's progress" (`session.html`): why the session couldn't start when it couldn't, then each step
 * in its words, the latest one still running (AC-4, AC-13). Until spec 013 brings the changes beside it,
 * it takes the page's width (Q9a).
 */
export function SessionProgress({ session }: { session: Session }) {
  const problem = session.problem === null ? null : problemWords(session.problem, session);
  // Focus comes here once you've answered the last call waiting for you (spec 012, AC-18).
  const pane = useRef<HTMLElement>(null);
  return (
    <Panel ref={pane} tabIndex={-1} title="Claude's progress" actions={<WorkedFor session={session} />}>
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
      </div>
    </Panel>
  );
}

/** The stepper and the pane while the session loads: their shapes, so nothing moves when it arrives (AC-16). */
export function SessionProgressSkeleton() {
  return (
    // Hidden from screen readers, as every skeleton is; the page says it's busy.
    <div aria-hidden className="flex flex-col gap-6">
      <span className="flex h-6 items-center">
        <Skeleton className="h-4 w-80 max-w-full" />
      </span>
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
