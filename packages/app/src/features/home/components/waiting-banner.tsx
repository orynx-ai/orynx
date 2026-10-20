import { Link } from '@tanstack/react-router';
import { Alert02Icon } from '@hugeicons/core-free-icons';
import type { SessionSummary } from '@devhub/contracts';
import { Button, Toast } from '@devhub/ui';
import { useSession, useSessions } from '../../sessions/queries.ts';
import { sourceLabel } from '../../sessions/source-label.ts';
import { bannerDetail, composerWords } from '../composer-words.ts';

/** The banner for one waiting session: its first waiting call is read from the session itself. */
function WaitingFor({ waiting, more }: { waiting: SessionSummary; more: number }) {
  const session = useSession(waiting.id);
  const approval = session.data?.approvals[0] ?? null;
  return (
    <Toast
      icon={Alert02Icon}
      tone="warning"
      role="status"
      title={composerWords.banner.title}
      detail={bannerDetail({ key: sourceLabel(waiting.source) ?? null, title: waiting.title, approval, more })}
      actions={
        <Button asChild variant="secondary" size="sm">
          <Link to="/sessions/$sessionId" params={{ sessionId: waiting.id }}>
            {composerWords.banner.action}
          </Link>
        </Button>
      }
    />
  );
}

/**
 * Home's waiting banner (spec 015, AC-25 to AC-27, Q11): when a session needs you, the one waiting longest, what it
 * wants, and how many more wait. It floats as a pop-up under the page bar (the user's call, 20 Oct 2026). It shows
 * only once the session list has loaded, which the sidebar asks for first, and the event stream keeps it live: it goes
 * as soon as nothing waits. Coming or going, it moves no focus.
 */
export function WaitingBanner() {
  const sessions = useSessions({ recent: true });
  const waiting = (sessions.data?.sessions ?? [])
    .filter((session) => session.state === 'needs_you')
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const first = waiting[0];
  if (first === undefined) return null;
  return <WaitingFor waiting={first} more={waiting.length - 1} />;
}
