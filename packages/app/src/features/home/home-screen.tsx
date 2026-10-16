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
      <PageBody className="items-center pt-8 pb-12">
        <div className="flex w-full max-w-190 flex-col gap-5">
          <h1 className="m-0 mt-4 text-center font-serif text-display font-normal">What should we build today?</h1>

          <section
            aria-labelledby="attention-title"
            className="overflow-hidden rounded-md border border-border bg-raised"
          >
            <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5">
              <h2 id="attention-title" className="m-0 text-title font-semibold">
                Needs your attention
              </h2>
            </div>
            <div className="p-4">
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
            </div>
          </section>
        </div>
      </PageBody>
    </>
  );
}
