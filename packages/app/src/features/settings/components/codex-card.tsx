import type { ReactNode } from 'react';
import { CodeIcon } from '@hugeicons/core-free-icons';
import type { CodexLogin } from '@devhub/contracts';
import type { PillTone } from '@devhub/ui';
import { useCheckCodexLogin, useCodexLogin } from '../queries.ts';
import { AgentLoginCard } from './agent-login-card.tsx';

const pills: Record<CodexLogin['state'], { tone: PillTone; label: string }> = {
  signed_in: { tone: 'success', label: 'Active' },
  signed_out: { tone: 'warning', label: 'Not signed in' },
  not_installed: { tone: 'neutral', label: 'Not installed' },
  error: { tone: 'danger', label: 'Error' },
};

/** How Codex is signed in, in the card's words (spec 052, Q5). */
function accountLine(login: Extract<CodexLogin, { state: 'signed_in' }>): string {
  if (login.method === 'api_key') return 'Signed in with an API key';
  if (login.method === 'other') return 'Signed in';
  return login.email === null ? 'Signed in with ChatGPT' : `Signed in with ChatGPT as ${login.email}`;
}

/** What the card says when Codex isn't ready (Q5). */
const notReadyLines: Record<Exclude<CodexLogin['state'], 'signed_in'>, ReactNode> = {
  signed_out: (
    <>
      Run <code className="font-mono">codex login</code> in a terminal, then check again.
    </>
  ),
  not_installed: (
    <>
      Install Codex with <code className="font-mono">npm install -g @openai/codex</code>, then check again.
    </>
  ),
  error: "Couldn't check Codex. Check again.",
};

/**
 * Settings › Coding agent: whether Codex is ready, from Codex's own login on this computer (spec 052). It takes the
 * design's "More agents" place, drawn as the Claude card is (Q7), with a plain glyph for its mark.
 */
export function CodexCard() {
  const login = useCodexLogin();
  const check = useCheckCodexLogin();
  // As Claude's card: a failed Check again stands until the next press, or a newer answer from the server.
  const checkFailed = check.isError && check.submittedAt >= login.dataUpdatedAt;
  const state: CodexLogin['state'] | null = checkFailed
    ? 'error'
    : (login.data?.state ?? (login.isError ? 'error' : null));
  return (
    <AgentLoginCard
      name="Codex"
      icon={CodeIcon}
      pill={state === null ? null : pills[state]}
      account={login.data?.state === 'signed_in' && state === 'signed_in' ? accountLine(login.data) : null}
      notReady={state === null || state === 'signed_in' ? null : notReadyLines[state]}
      checking={check.isPending}
      onCheck={() => {
        check.mutate();
      }}
    />
  );
}
