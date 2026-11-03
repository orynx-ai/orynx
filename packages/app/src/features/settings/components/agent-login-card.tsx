import { useEffect, useId, useRef, type ReactNode } from 'react';
import { RefreshIcon } from '@hugeicons/core-free-icons';
import { Button, Icon, Pill, Skeleton, type IconSvgElement, type PillTone } from '@devhub/ui';

export interface AgentLoginCardProps {
  name: string;
  icon: IconSvgElement;
  /** Under the name in every state, when the agent has one. */
  line?: string;
  /** The state's pill; null before the first answer. */
  pill: { tone: PillTone; label: string } | null;
  /** How it's signed in, once it is. */
  account: string | null;
  /** What to do when it isn't ready, with Check again under it. */
  notReady: ReactNode;
  checking: boolean;
  onCheck: () => void;
}

/**
 * One agent's row in Settings › Coding agent (spec 010, spec 052): its mark, name and state, then its lines. There is
 * nothing to connect here: an agent that isn't ready says how, and Check again asks once more. Drawn as the redesign's
 * agent row (19 Oct 2026).
 */
export function AgentLoginCard({ name, icon, line, pill, account, notReady, checking, onCheck }: AgentLoginCardProps) {
  const nameId = useId();
  const ready = notReady === null;
  const lineRef = useRef<HTMLParagraphElement>(null);
  const buttonHadFocus = useRef(false);
  // Check again goes away once the agent is signed in: its focus moves to the line that says so.
  useEffect(() => {
    if (ready && buttonHadFocus.current) {
      buttonHadFocus.current = false;
      lineRef.current?.focus();
    }
  }, [ready]);

  return (
    <div
      role="group"
      aria-labelledby={nameId}
      aria-busy={pill === null}
      className="flex items-start gap-3.5 rounded-md border border-border bg-raised px-4 py-3.5"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-info-subtle text-info-foreground"
      >
        <Icon icon={icon} />
      </span>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        {/* 24 px tall, the pill's height, so the skeleton and the pill sit alike. */}
        <div className="flex min-h-6 flex-wrap items-center gap-2">
          <h3 id={nameId} className="m-0 text-body font-medium">
            {name}
          </h3>
          {pill === null ? <Skeleton className="h-6 w-16" /> : <Pill tone={pill.tone}>{pill.label}</Pill>}
        </div>
        {line === undefined ? null : <p className="m-0 text-small text-muted-foreground">{line}</p>}
        {pill === null ? (
          // The account line's height, so an Active answer moves nothing (Q9).
          <Skeleton className="my-0.5 h-4 w-48 max-w-full" />
        ) : null}
        {account === null ? null : (
          // One line, as its skeleton, so the answer moves nothing at 360 px; the whole line on hover.
          <p ref={lineRef} tabIndex={-1} title={account} className="m-0 truncate text-small text-muted-foreground">
            {account}
          </p>
        )}
        {notReady === null ? null : (
          <>
            <p className="m-0 text-small">{notReady}</p>
            {/* A flex row, so the spinner coming in can't shift the label's baseline and grow the card (AC-7). */}
            <div className="mt-2 flex">
              <Button
                variant="secondary"
                size="sm"
                pending={checking}
                onFocus={() => {
                  buttonHadFocus.current = true;
                }}
                onBlur={() => {
                  buttonHadFocus.current = false;
                }}
                onClick={onCheck}
              >
                {checking ? null : <Icon icon={RefreshIcon} aria-hidden />}
                {checking ? 'Checking…' : 'Check again'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
