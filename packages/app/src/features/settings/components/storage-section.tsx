import { useId } from 'react';
import { HardDriveIcon } from '@hugeicons/core-free-icons';
import { cleanupDays, CleanupDaysSchema, type CleanupDays, type Storage } from '@devhub/contracts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SettingList,
  SettingRow,
  Skeleton,
} from '@devhub/ui';
import { sizeText } from '../../../words/size.ts';
import { useChangePreferences, usePreferences, useStorage } from '../queries.ts';
import { SaveError } from './save-error.tsx';
import { SectionHeading } from './section-heading.tsx';

/** Spec 047, D (wording from the 050 draft it folded in, Q5). */
export const storageWords = {
  heading: 'Storage',
  title: 'Delete old sessions',
  description:
    'Sessions with no activity for this long are deleted with their worktrees. Their branches stay. Pinned sessions, open pull requests and changes that aren’t committed are kept.',
  never: 'Never',
  used: (bytes: number) => `Session worktrees use ${sizeText(bytes)} on this computer.`,
  choice: (days: CleanupDays, going: Storage['choices'][number] | undefined) => {
    const after = `After ${String(days)} days`;
    if (going === undefined || going.sessions === 0) return after;
    const sessions = going.sessions === 1 ? '1 session' : `${String(going.sessions)} sessions`;
    return `${after} · ${sessions} now, ${sizeText(going.bytes)}`;
  },
} as const;

/** Select's values: Never, or a number of days. */
const never = 'never';

/**
 * Settings › Coding agent's last section (spec 047, D): what the session worktrees use, and Delete old sessions, saved
 * as you pick like Claude changes Jira, each choice saying what it would delete now. The size shows a skeleton while
 * the hub measures, and is left out if measuring fails; the setting still saves.
 */
export function StorageSection() {
  const preferences = usePreferences();
  const change = useChangePreferences();
  const storage = useStorage();
  const headingId = useId();
  const titleId = useId();
  const picked = preferences.data?.deleteSessionsAfterDays;
  const used = storage.isPending ? (
    <span className="flex h-5 items-center">
      <Skeleton className="h-4 w-64 max-w-full" />
    </span>
  ) : storage.isError ? undefined : (
    storageWords.used(storage.data.bytes)
  );
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2.5">
      <SectionHeading id={headingId} icon={HardDriveIcon} title={storageWords.heading} line={used} />
      <SettingList>
        <SettingRow
          title={storageWords.title}
          titleId={titleId}
          description={storageWords.description}
          control={
            <Select
              // While loading, Never and disabled, so nothing moves when the answer comes.
              value={picked == null ? never : picked.toString()}
              disabled={picked === undefined}
              onValueChange={(value) => {
                change.mutate({
                  deleteSessionsAfterDays: value === never ? null : CleanupDaysSchema.parse(Number(value)),
                });
              }}
            >
              <SelectTrigger aria-labelledby={titleId} className="w-auto min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={never}>{storageWords.never}</SelectItem>
                {cleanupDays.map((days) => (
                  <SelectItem key={days} value={days.toString()}>
                    {storageWords.choice(
                      days,
                      storage.data?.choices.find((choice) => choice.days === days),
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      </SettingList>
      {change.isError ? <SaveError /> : null}
    </section>
  );
}
