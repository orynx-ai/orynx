import { Callout } from '@devhub/ui';
import { useStatus } from '../features/settings/queries.ts';
import { limitLine } from '../words/claude-limit.ts';
import { useNow } from '../words/use-now.ts';

/**
 * Close to Claude's limit (spec 057, E, Q7): a warning at the top of Home and the Sessions page while a session last
 * heard you're close, gone once the window resets. It announces itself and never takes focus. Design: none (Q8).
 */
export function LimitCallout() {
  const limit = useStatus().data?.claudeLimit ?? null;
  const now = useNow();
  if (limit === null) return null;
  const title = 'Close to your Claude limit';
  return (
    <Callout tone="warning" role="status" aria-label={title} title={title}>
      <span className="text-small">{limitLine(limit, now)}</span>
    </Callout>
  );
}
