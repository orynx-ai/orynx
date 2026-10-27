import { useId } from 'react';
import type { Updates } from '@devhub/contracts';
import { SettingList, SettingRow, Skeleton } from '@devhub/ui';
import { useUpdates } from '../queries.ts';
import { versionText } from '../update-words.ts';
import { ServerUnreachable } from './server-unreachable.tsx';
import { UpdateCommands, UpdatesRow } from './updates-section.tsx';
import { AllReleasesLink, WhatsNew } from './whats-new.tsx';

/**
 * Settings › About (spec 045): the version you run, the updates and what's new. Until the hub answers, and until
 * GitHub first has, each part holds its place with skeletons of the same size, so nothing moves when it comes (AC-4).
 */
export function AboutPanel() {
  const updates = useUpdates();
  const whatsNew = useId();

  if (updates.data === undefined && updates.isError) return <ServerUnreachable />;
  const loaded = updates.data;
  // The hub's first check of GitHub may still be on its way when the page opens.
  const known = loaded !== undefined && (loaded.checkedAt !== null || loaded.checkFailed) ? loaded : undefined;

  return (
    <div aria-busy={known === undefined} className="flex flex-col gap-8">
      <SettingList>
        <VersionRow updates={loaded} />
        {known === undefined ? (
          <SettingRow
            title={<Skeleton className="my-1 h-4 w-48 max-w-full" />}
            description={<Skeleton className="my-0.5 h-4 w-32" />}
            control={<Skeleton className="h-8 w-36" />}
          />
        ) : (
          <UpdatesRow updates={known} />
        )}
      </SettingList>
      {known === undefined ? null : <UpdateCommands updates={known} />}
      <section aria-labelledby={whatsNew} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
          <h2 id={whatsNew} className="m-0 text-body font-medium">
            What’s new
          </h2>
          <AllReleasesLink />
        </div>
        {known === undefined ? (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-raised px-4 py-3.5">
            <Skeleton className="my-1 h-4 w-24" />
            <Skeleton className="my-0.5 h-4 w-20" />
            <Skeleton className="my-1 h-4 w-full" />
            <Skeleton className="my-1 h-4 w-2/3" />
          </div>
        ) : (
          <WhatsNew releases={known.releases} />
        )}
      </section>
    </div>
  );
}

/** "Desktop app", "Installed from ~/Code/orynx" or "Started by hand from ~/Code/orynx" (Q7). */
function kindLine({ kind, folder }: Updates): string {
  if (kind === 'desktop' || folder === null) return 'Desktop app';
  return kind === 'service' ? `Installed from ${folder}` : `Started by hand from ${folder}`;
}

/**
 * The version, then which Orynx it is, one line each: a long version or folder is cut and shown whole on hover, so
 * the row is as tall as its skeleton at every width (AC-4).
 */
function VersionRow({ updates }: { updates: Updates | undefined }) {
  const id = useId();
  const version = updates === undefined ? null : versionText(updates.running);
  const kind = updates === undefined ? null : kindLine(updates);
  return (
    <SettingRow
      role="group"
      aria-labelledby={id}
      titleId={id}
      title="Version"
      description={
        version === null ? (
          <Skeleton className="my-0.5 h-4 w-32 max-w-full" />
        ) : (
          <span className="block truncate text-foreground" title={version}>
            {version}
          </span>
        )
      }
    >
      {kind === null ? (
        <Skeleton className="my-0.5 h-4 w-48 max-w-full" />
      ) : (
        <span className="truncate text-small text-muted-foreground" title={kind}>
          {kind}
        </span>
      )}
    </SettingRow>
  );
}
