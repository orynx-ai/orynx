import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sessionCommandsQueryOptions } from '@devhub/api-client';
import { terminalLimits, type ClaudeCommand, type ApprovalDecision, type Session } from '@devhub/contracts';
import { Button, CommandBlock, CopyButton, Pill, Skeleton, type CommandBlockProps } from '@devhub/ui';
import { useApi } from '../../../../api.tsx';
import {
  alwaysAllowLabel,
  alwaysAskLine,
  answerErrorLine,
  approvalButtons,
  approvalTitle,
  type AnswerError,
} from '../../approval-words.ts';
import { useRespondToApproval } from '../../queries.ts';
import { refusedTitle } from '../../step-words.ts';
import { answerFailure } from '../approval-callout.tsx';
import { copyWhat, cutNote, statusWords, terminalWords } from './terminal-words.ts';

type CommandApproval = Extract<Session['approvals'][number], { kind: 'command' }>;

/** A session saved before spec 036 kept only its commands' words, from Claude's progress (AC-23). */
function earlierCommands(session: Session): string[] {
  return session.activities.flatMap((activity) => (activity.kind === 'command' ? activity.commands : []));
}

function copyOf(command: string, output: readonly string[]) {
  return <CopyButton text={[command, ...output].join('\n')} what={copyWhat(command)} label={terminalWords.copy} />;
}

/** How one of Claude's commands shows: its status, output and the line under it. */
function blockOf(command: Exclude<ClaudeCommand, { state: 'note' }>): Omit<CommandBlockProps, 'command' | 'badge'> {
  switch (command.state) {
    case 'running':
      return { status: statusWords.running, tone: 'warning' };
    case 'done':
    case 'failed':
      return {
        status: command.state === 'done' ? statusWords.done(command.ms) : statusWords.failed(command.ms),
        tone: command.state === 'done' ? 'success' : 'danger',
        output: command.output,
        actions: copyOf(command.command, command.output),
        ...(command.cut ? { note: cutNote(terminalLimits.claudeLines) } : {}),
      };
    case 'stopped':
      return { status: statusWords.stopped, tone: 'neutral' };
    case 'denied':
      return { status: statusWords.denied, tone: 'neutral', children: <span>{terminalWords.denied}</span> };
    case 'refused':
      return {
        status: statusWords.refused,
        tone: 'neutral',
        children: <span>{refusedTitle({ access: 'run', reason: command.reason })}</span>,
      };
  }
}

/** A command waiting for your answer, with the same choices and reason as the session's callout (Q7). */
function WaitingCommand({ session, approval }: { session: Session; approval: CommandApproval }) {
  const respond = useRespondToApproval(session.id);
  const [failed, setFailed] = useState<AnswerError | null>(null);
  const busy = respond.isPending ? respond.variables.decision : null;
  const answer = (decision: ApprovalDecision) => {
    setFailed(null);
    respond.mutate(
      { approvalId: approval.id, decision },
      {
        onError: (failure) => {
          setFailed(answerFailure(failure, approval));
        },
      },
    );
  };
  const choice = (decision: ApprovalDecision, words: string) => (
    <Button
      size="sm"
      variant={decision === 'deny' ? 'ghost' : 'secondary'}
      pending={busy === decision}
      disabled={busy !== null && busy !== decision}
      onClick={() => {
        answer(decision);
      }}
    >
      {words}
    </Button>
  );
  return (
    <CommandBlock
      command={approval.command}
      badge={<Pill tone="info">{terminalWords.claude}</Pill>}
      status={statusWords.waiting}
      tone="warning"
    >
      <span className="min-w-0 flex-1 basis-64 text-warning">
        {approval.alwaysAsk === null ? approvalTitle(approval) : alwaysAskLine(approval.alwaysAsk)}
      </span>
      {choice('allow_once', approvalButtons.allowOnce)}
      {approval.alwaysAllow === null ? null : choice('always_allow', alwaysAllowLabel(approval.alwaysAllow))}
      {choice('deny', approvalButtons.deny)}
      {failed === null ? null : <span className="basis-full text-danger">{answerErrorLine(failed)}</span>}
    </CommandBlock>
  );
}

/**
 * The Terminal's Claude tab (spec 036, AC-19 to AC-24): every command Claude ran in the session, oldest first, as
 * blocks with its output, then the commands waiting for you. Read-only: there's nothing to type here.
 */
export function ClaudeTab({ session }: { session: Session }) {
  const api = useApi();
  const commands = useQuery(sessionCommandsQueryOptions(api, session.id));
  const log = useRef<HTMLDivElement>(null);
  const waiting = session.approvals.filter((approval): approval is CommandApproval => approval.kind === 'command');
  const ran = commands.data?.commands ?? [];
  const earlier = commands.isSuccess && ran.length === 0 ? earlierCommands(session) : [];
  const count = ran.length + earlier.length + waiting.length;

  // The newest command is at the bottom, so the log keeps it in view, as a terminal does.
  useEffect(() => {
    const element = log.current;
    if (element !== null) element.scrollTop = element.scrollHeight;
  }, [count]);

  const badge = <Pill tone="info">{terminalWords.claude}</Pill>;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-2 text-label text-muted-foreground">
        <Pill plain>{terminalWords.sandbox}</Pill>
        <Pill plain>{terminalWords.readOnly}</Pill>
        <span>{terminalWords.claudeMeta}</span>
      </div>
      {/* It scrolls once there are many commands, so it takes focus to scroll by keyboard; the ring is drawn inside. */}
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label={terminalWords.claudeLog}
        aria-busy={commands.isPending}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take keyboard focus (WCAG 2.1.1)
        tabIndex={0}
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-2.5 focus-visible:-outline-offset-2"
      >
        {commands.isPending ? (
          <>
            <Skeleton className="h-20 w-full rounded-md" />
            <Skeleton className="h-20 w-full rounded-md" />
          </>
        ) : commands.isError ? (
          <div className="flex flex-wrap items-center gap-2 text-small">
            <span>{terminalWords.claudeNotLoaded}</span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void commands.refetch();
              }}
            >
              {terminalWords.tryAgain}
            </Button>
          </div>
        ) : count === 0 ? (
          <p className="text-small text-muted-foreground">{terminalWords.nothingYet}</p>
        ) : null}
        {ran.map((command) =>
          command.state === 'note' ? (
            <p key={command.id} className="text-small text-muted-foreground">
              {terminalWords.sentFromTerminal} <code className="font-mono text-code">{command.command}</code>
            </p>
          ) : (
            <CommandBlock key={command.id} command={command.command} badge={badge} {...blockOf(command)} />
          ),
        )}
        {earlier.map((command, place) => (
          // Commands saved before spec 036 have no id of their own; their place in the list never changes.
          <CommandBlock key={place} command={command} badge={badge} tone="neutral" note={terminalWords.noOutput} />
        ))}
        {waiting.map((approval) => (
          <WaitingCommand key={approval.id} session={session} approval={approval} />
        ))}
      </div>
      <p className="border-t border-border px-3.5 py-2 text-label text-muted-foreground">{terminalWords.claudeFoot}</p>
    </div>
  );
}
