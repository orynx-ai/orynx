// Design: docs/design/screens/tickets.html — page bar and the "tool not connected" line from the spec
import { Link } from '@tanstack/react-router';
import { Button, EmptyState } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';

/** Your current Jira sprint as a board or a list (roadmap 008). Needs Jira (roadmap 003). */
export function TicketsScreen() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Tickets' }]} />} />
      <PageBody>
        <EmptyState
          title="Jira is not connected"
          action={
            <Button asChild size="sm">
              <Link to="/settings/$tab" params={{ tab: 'connections' }}>
                Open Settings
              </Link>
            </Button>
          }
        >
          <span>Connect it in Settings to see your sprint.</span>
        </EmptyState>
      </PageBody>
    </>
  );
}
