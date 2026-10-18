import { useEffect, useRef, type ReactNode } from 'react';
import type { ClaudeLogin, ClaudeSignedIn } from '@devhub/contracts';
import { Button, Card, Pill, Skeleton, type PillTone } from '@devhub/ui';
import { useCheckClaudeLogin, useClaudeLogin } from '../queries.ts';

/** The design's line, in every state (spec 010, Q5f). */
const designLine = 'Uses your company Claude login through the Claude Agent SDK. No separate API key.';

const pills: Record<ClaudeLogin['state'], { tone: PillTone; label: string }> = {
  signed_in: { tone: 'success', label: 'Active' },
  signed_out: { tone: 'warning', label: 'Not signed in' },
  error: { tone: 'danger', label: 'Error' },
};

/** How Claude Code is signed in, in the card's words (Q5b). */
function accountLine(login: ClaudeSignedIn): string {
  switch (login.method) {
    case 'claude_ai':
      if (login.email === null) return 'Signed in';
      return login.organisation === null
        ? `Signed in as ${login.email}`
        : `Signed in as ${login.email} · ${login.organisation}`;
    case 'api_key':
      return 'Signed in with an API key';
    case 'bedrock':
      return 'Signed in through Amazon Bedrock';
    case 'vertex':
      return 'Signed in through Google Vertex AI';
    case 'other':
      return 'Signed in';
  }
}

/** What the card says under the design's line when Claude isn't ready (Q5c, Q5d). */
const notReadyLines: Record<'signed_out' | 'error', ReactNode> = {
  signed_out: (
    <>
      Claude Code isn&apos;t signed in on this computer. Run <code className="font-mono">claude</code> in a terminal and
      sign in with your company login, then check again.
    </>
  ),
  error: "Orynx couldn't run Claude Code's login check. See the terminal for details.",
};

/**
 * Settings › Coding agent: whether Claude is ready, from Claude Code's own login (spec 010). There is
 * nothing to connect here: when it isn't signed in, the card says how, and Check again asks once more.
 */
export function ClaudeCard() {
  const login = useClaudeLogin();
  const check = useCheckClaudeLogin();
  // A server that doesn't answer is a check that couldn't run, as far as this card can tell.
  const state: ClaudeLogin['state'] | null = login.data?.state ?? (login.isError ? 'error' : null);
  const notReady = state === 'signed_out' || state === 'error';

  const lineRef = useRef<HTMLParagraphElement>(null);
  const buttonHadFocus = useRef(false);
  // Check again goes away once Claude is signed in: its focus moves to the line that says so.
  useEffect(() => {
    if (!notReady && buttonHadFocus.current) {
      buttonHadFocus.current = false;
      lineRef.current?.focus();
    }
  }, [notReady]);

  return (
    <Card
      title="Claude"
      look="selected"
      aria-busy={state === null}
      aside={
        state === null ? <Skeleton className="h-6 w-16" /> : <Pill tone={pills[state].tone}>{pills[state].label}</Pill>
      }
    >
      <p className="m-0 text-small text-muted-foreground">{designLine}</p>
      {state === null ? (
        // The account line's height, so an Active answer moves nothing (Q9).
        <Skeleton className="my-0.5 h-4 w-48 max-w-full" />
      ) : null}
      {login.data?.state === 'signed_in' ? (
        <p ref={lineRef} tabIndex={-1} className="m-0 text-small wrap-anywhere">
          {accountLine(login.data)}
        </p>
      ) : null}
      {notReady ? (
        <>
          <p className="m-0 text-small">{notReadyLines[state]}</p>
          <div>
            <Button
              variant="secondary"
              size="sm"
              pending={check.isPending}
              onFocus={() => {
                buttonHadFocus.current = true;
              }}
              onBlur={() => {
                buttonHadFocus.current = false;
              }}
              onClick={() => {
                check.mutate();
              }}
            >
              {check.isPending ? 'Checking…' : 'Check again'}
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}
