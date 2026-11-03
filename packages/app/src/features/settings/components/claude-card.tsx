import type { ReactNode } from 'react';
import { ClaudeIcon } from '@hugeicons/core-free-icons';
import type { ClaudeLogin, ClaudeSignedIn } from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';
import { useCheckClaudeLogin, useClaudeLogin } from '../queries.ts';
import { AgentLoginCard } from './agent-login-card.tsx';

/** The design's line, in every state (spec 010, Q5f), in the redesign's words (19 Oct 2026). */
const designLine = 'Company login through the Claude Agent SDK. No API key needed.';

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
  // A server that doesn't answer is a check that couldn't run, as far as this card can tell. A failed
  // Check again stands until the next press, or until a newer answer arrives from the server.
  const checkFailed = check.isError && check.submittedAt >= login.dataUpdatedAt;
  const state: ClaudeLogin['state'] | null = checkFailed
    ? 'error'
    : (login.data?.state ?? (login.isError ? 'error' : null));
  return (
    <AgentLoginCard
      name="Claude"
      icon={ClaudeIcon}
      line={designLine}
      pill={state === null ? null : pills[state]}
      account={login.data?.state === 'signed_in' && state === 'signed_in' ? accountLine(login.data) : null}
      notReady={state === 'signed_out' || state === 'error' ? notReadyLines[state] : null}
      checking={check.isPending}
      onCheck={() => {
        check.mutate();
      }}
    />
  );
}
