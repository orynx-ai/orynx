// Design: none — the spec's "View all" list has no screen design yet; reuses the page frame and EmptyState
import { EmptyState } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';

/** Every Claude session, newest first (roadmap 011). */
export function SessionsScreen() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Sessions' }]} />} />
      <PageBody>
        <EmptyState title="No sessions yet">
          <span>Start one from Home or from a ticket.</span>
        </EmptyState>
      </PageBody>
    </>
  );
}
