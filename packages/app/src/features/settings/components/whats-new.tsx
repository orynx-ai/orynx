import { useId } from 'react';
import type { Release } from '@devhub/contracts';
import { EmptyState, ExternalLink, Markdown, Pill } from '@devhub/ui';
import { usePlatform } from '../../../platform.tsx';
import { months } from '../../../words/calendar.ts';

const allReleases = 'https://github.com/orynx-ai/orynx/releases';

/**
 * Settings › About's What's new (spec 045): each release's notes from GitHub, newest first (Q8), drawn as a ticket's
 * description is. Notes are text from outside: raw HTML shows as text, and links open in the browser (AC-15, AC-16).
 */
export function WhatsNew({ releases }: { releases: readonly Release[] }) {
  const platform = usePlatform();
  if (releases.length === 0) {
    return <EmptyState title="No releases yet">Each release’s notes show here.</EmptyState>;
  }
  return (
    <ol className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border bg-raised p-0">
      {releases.map((release) => (
        <li key={release.version}>
          <ReleaseNotes
            release={release}
            onOpenLink={(url) => {
              platform.openExternal(url);
            }}
          />
        </li>
      ))}
    </ol>
  );
}

/** "All releases on GitHub", beside the heading. */
export function AllReleasesLink() {
  const platform = usePlatform();
  return (
    <ExternalLink
      href={allReleases}
      onOpen={(url) => {
        platform.openExternal(url);
      }}
    >
      All releases on GitHub
    </ExternalLink>
  );
}

function ReleaseNotes({ release, onOpenLink }: { release: Release; onOpenLink: (url: string) => void }) {
  const id = useId();
  // "22 Oct 2026": releases span years, so the year is always there.
  const date = new Date(release.publishedAt);
  const published = `${String(date.getDate())} ${(months[date.getMonth()] ?? '').slice(0, 3)} ${String(date.getFullYear())}`;
  return (
    <article aria-labelledby={id} className="flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <h3 id={id} className="m-0 flex items-center gap-2 text-body font-medium">
          {release.version}
          {release.newer ? (
            <Pill tone="info" plain>
              New
            </Pill>
          ) : null}
          {release.mine ? <Pill plain>Your version</Pill> : null}
        </h3>
        <time dateTime={release.publishedAt} className="text-small text-muted-foreground">
          {published}
        </time>
      </div>
      {release.notes === '' ? (
        <p className="m-0 text-small text-muted-foreground">No notes for this release.</p>
      ) : (
        <Markdown text={release.notes} onOpenLink={onOpenLink} headingLevel={4} />
      )}
    </article>
  );
}
