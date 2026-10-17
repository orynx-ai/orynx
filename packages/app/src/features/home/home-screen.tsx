// Design: docs/design/screens/home.html — page bar, greeting and the "Needs your attention" panel
import { Link } from '@tanstack/react-router';
import { Button, EmptyState } from '@devhub/ui';
import { PageBar, PageBody, PageBreadcrumb } from '../../shell/page-frame.tsx';

/**
 * Home answers "what should Claude build next?" and "who is waiting on me?". The composer
 * (roadmap 015) and the attention list (roadmap 007) fill this frame; until a tool is
 * connected the list says how it gets filled.
 */
export function HomeScreen() {
  return (
    <>
      <PageBar breadcrumb={<PageBreadcrumb crumbs={[{ label: 'Home' }]} />} />
      <PageBody width="narrow">
        {/* 48 px above the greeting (design system, --space-12): the body's 24 px plus 24 px here. */}
        <h1 className="m-0 mt-6 text-center font-serif text-display font-normal">What should we build today?</h1>

        <section aria-labelledby="attention-title" className="rounded-md border border-border bg-raised">
          <h2 id="attention-title" className="m-0 px-5 pt-4 text-title font-medium">
            Needs your attention
          </h2>
          <EmptyState
            title="Nothing needs you yet"
            action={
              <Button asChild size="sm">
                <Link to="/settings/$tab" params={{ tab: 'connections' }}>
                  Connect your tools
                </Link>
              </Button>
            }
          >
            <span>Connect Jira, GitHub or Slack and the work that needs you shows up here.</span>
          </EmptyState>
        </section>
      </PageBody>
    </>
  );
}
