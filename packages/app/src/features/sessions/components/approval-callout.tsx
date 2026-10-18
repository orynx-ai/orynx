import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { ApiRequestError } from '@devhub/api-client';
import type { ApprovalDecision, Session, SessionApproval } from '@devhub/contracts';
import { Button, Callout, CalloutCode, DiffView } from '@devhub/ui';
import {
  alwaysAllowLabel,
  alwaysAskLine,
  answerErrorLine,
  approvalButtons,
  approvalTitle,
  moreLinesText,
  type AnswerError,
} from '../approval-words.ts';
import { useRespondToApproval } from '../queries.ts';

/** What the callout shows under its title: the command as written, or the edit's change (Q9). */
function What({ approval }: { approval: SessionApproval }) {
  if (approval.kind === 'command') {
    return (
      <>
        <CalloutCode>{approval.command}</CalloutCode>
        {approval.alwaysAsk === null ? null : <p className="m-0 text-small">{alwaysAskLine(approval.alwaysAsk)}</p>}
      </>
    );
  }
  return (
    <>
      <DiffView path={approval.path} lines={approval.lines} />
      {approval.moreLines > 0 ? <p className="m-0 text-small">{moreLinesText(approval.moreLines)}</p> : null}
    </>
  );
}

/**
 * The amber callout at the top of Claude's progress (`session.html`, spec 012): the oldest call waiting for
 * you, what it is, and Allow once, Always allow (only where the server offers it) and Deny. It announces
 * itself (`role="alert"`) but never takes focus, so no key pressed for something else answers it (AC-18).
 * Once you answer, focus moves to the next waiting call's first button, or to `afterAll` when none is left.
 * Stays mounted with nothing to show, so it can hand focus on after the last call goes.
 */
export function ApprovalCallout({
  session,
  afterAll,
}: {
  session: Session;
  /** Where focus goes once nothing waits: Claude's progress. */
  afterAll: RefObject<HTMLElement | null>;
}) {
  const approval = session.approvals[0];
  const respond = useRespondToApproval(session.id);
  // An error belongs to the call it was about; the next call starts without one.
  const [failed, setFailed] = useState<{ approvalId: string; error: AnswerError } | null>(null);
  // The call you answered from here, until it has gone from the session; and the one shown now.
  const answered = useRef<string | null>(null);
  const shown = useRef<string | undefined>(approval?.id);
  const firstButton = useRef<HTMLButtonElement>(null);

  /** Focus moves to the next waiting call's first button, or to Claude's progress when none is left. */
  const moveOn = useCallback(() => {
    answered.current = null;
    if (shown.current === undefined) afterAll.current?.focus();
    else firstButton.current?.focus();
  }, [afterAll]);

  useEffect(() => {
    shown.current = approval?.id;
    if (answered.current !== null && approval?.id !== answered.current) moveOn();
  }, [approval?.id, moveOn]);

  if (approval === undefined) return null;
  const busy = respond.isPending ? respond.variables.decision : null;
  const error = failed?.approvalId === approval.id ? failed.error : null;

  /** The answer went through: the call goes once the session changes, which may already have happened. */
  function done(approvalId: string) {
    if (shown.current === approvalId) answered.current = approvalId;
    else moveOn();
  }

  function answer(decision: ApprovalDecision) {
    if (approval === undefined) return;
    const call = approval;
    setFailed(null);
    respond.mutate(
      { approvalId: call.id, decision },
      {
        onSuccess: () => {
          done(call.id);
        },
        onError: (failure) => {
          const code = failure instanceof ApiRequestError ? failure.code : null;
          // Another tab, or Stop, answered first: the first answer counts, and this one has nothing to say (AC-13).
          if (code === 'already_answered') done(call.id);
          else if (code === 'settings_unsaved' && call.kind === 'command' && call.alwaysAllow !== null) {
            setFailed({ approvalId: call.id, error: { kind: 'not_saved', entry: call.alwaysAllow } });
          } else setFailed({ approvalId: call.id, error: { kind: 'not_sent' } });
        },
      },
    );
  }

  const alwaysAllow = approval.kind === 'command' ? approval.alwaysAllow : null;
  return (
    <Callout
      key={approval.id}
      tone="warning"
      role="alert"
      title={approvalTitle(approval)}
      actions={
        <>
          <Button
            ref={firstButton}
            size="sm"
            pending={busy === 'allow_once'}
            disabled={busy !== null && busy !== 'allow_once'}
            onClick={() => {
              answer('allow_once');
            }}
          >
            {approvalButtons.allowOnce}
          </Button>
          {alwaysAllow === null ? null : (
            <Button
              size="sm"
              pending={busy === 'always_allow'}
              disabled={busy !== null && busy !== 'always_allow'}
              onClick={() => {
                answer('always_allow');
              }}
            >
              {alwaysAllowLabel(alwaysAllow)}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            pending={busy === 'deny'}
            disabled={busy !== null && busy !== 'deny'}
            onClick={() => {
              answer('deny');
            }}
          >
            {approvalButtons.deny}
          </Button>
        </>
      }
    >
      <What approval={approval} />
      {error === null ? null : <p className="m-0 text-small text-danger">{answerErrorLine(error)}</p>}
    </Callout>
  );
}
