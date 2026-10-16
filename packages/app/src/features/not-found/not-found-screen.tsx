// Design: none — no design for unknown addresses; reuses the page frame and EmptyState
import { Link } from '@tanstack/react-router';
import { Button, EmptyState } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';

export function NotFoundScreen() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Not found' }]} />} />
      <PageBody>
        <EmptyState
          title="This page does not exist"
          action={
            <Button asChild size="sm">
              <Link to="/">Go to Home</Link>
            </Button>
          }
        >
          <span>The address may be out of date.</span>
        </EmptyState>
      </PageBody>
    </>
  );
}
