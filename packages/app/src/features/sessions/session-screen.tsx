// Design: docs/design/screens/session.html — page bar only (breadcrumb Sessions / title, spec 001 Q8); the body is spec 011
import { useParams } from '@tanstack/react-router';
import { NotFoundScreen } from '../not-found/not-found-screen.tsx';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';
import { SessionsLoadError } from './components/sessions-load-error.tsx';
import { useSession } from './queries.ts';
import { sourceLabel } from './source-label.ts';

const sessionsCrumb = { label: 'Sessions', to: '/sessions' } as const;

/** One Claude session. Until spec 011 it shows only where you are. */
export function SessionScreen() {
  const { sessionId } = useParams({ from: '/sessions/$sessionId' });
  const session = useSession(sessionId);

  if (session.isPending) return <PageBar breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb]} />} />;

  if (session.isError) {
    return (
      <>
        <PageBar breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb]} />} />
        <PageBody>
          <SessionsLoadError onRetry={() => void session.refetch()} />
        </PageBody>
      </>
    );
  }

  if (session.data === null) return <NotFoundScreen />;

  const source = sourceLabel(session.data.source);
  return (
    <>
      <PageBar
        breadcrumb={<PageBreadcrumb crumbs={[sessionsCrumb, { label: session.data.title }]} />}
        {...(source === undefined ? {} : { meta: <span className="font-mono">{source}</span> })}
      />
      {/* Spec 011 replaces this with the visible title that session.html draws. */}
      <h1 className="sr-only">{session.data.title}</h1>
    </>
  );
}
