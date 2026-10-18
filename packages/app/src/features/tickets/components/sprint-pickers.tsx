import { useState } from 'react';
import type { Sprint, TicketsChoice } from '@devhub/contracts';
import {
  Combobox,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
  Picker,
  Skeleton,
} from '@devhub/ui';
import { useJiraConnection, useJiraProjects } from '../../settings/queries.ts';
import { useNow } from '../../../words/use-now.ts';
import { useChooseTicketsSprint, useTicketsSprints } from '../queries.ts';
import { noOpenSprintsText, noSprintName, openSprintLine, yourSprintText } from '../ticket-words.ts';

/** Both pickers the same width, so neither moves the filters beside them when its words change (spec 020). */
const pickerWidth = 'w-48 justify-between';

/**
 * Tickets' Project and Sprint pickers (spec 020). Project searches the Jira projects you can see, with Your
 * sprint first (AC-38); picking one shows its current sprint. Sprint lists that project's active then future
 * sprints, asked of Jira when it opens; picking one holds it. With Your sprint, Sprint lists the sprint's own
 * project when its board has one. No sprint ends the list (AC-39): the picked project's tickets in no sprint,
 * or with Your sprint, your own.
 */
export function SprintPickers({
  choice,
  sprint,
  loading = false,
}: {
  choice: TicketsChoice;
  sprint: Sprint | null;
  /** The sprint is on its way, so Sprint shows a bar where its name goes. */
  loading?: boolean;
}) {
  const jira = useJiraConnection();
  // Jira's project list is asked for once someone opens Project, not on every visit to Tickets.
  const [looked, setLooked] = useState(false);
  const projects = useJiraProjects(looked && jira.data !== undefined && jira.data.saved !== null);
  const choose = useChooseTicketsSprint();
  // Whose sprints the Sprint menu lists: the picked project, or Your sprint's own.
  const project = choice.projectKey ?? sprint?.projectKey ?? null;

  return (
    <>
      <Combobox
        options={[
          { value: '', label: yourSprintText },
          ...(projects.data?.projects ?? []).map((found) => ({
            value: found.key,
            label: `${found.key} · ${found.name}`,
          })),
        ]}
        value={choice.projectKey ?? ''}
        onValueChange={(key) => {
          choose.mutate({ projectKey: key === '' ? null : key, sprintId: null });
        }}
        searchLabel="Search projects"
        emptyText="No projects match"
        // Compact, at most 360 px tall: the user's call for this toolbar (spec 020, AC-40).
        size="sm"
        loading={projects.isPending && projects.fetchStatus !== 'idle'}
        onOpenChange={(open) => {
          if (open) setLooked(true);
        }}
      >
        <Picker className={pickerWidth}>
          <span className="text-muted-foreground">Project</span> {choice.projectKey ?? yourSprintText}
        </Picker>
      </Combobox>
      <SprintMenu
        project={project}
        current={choice.sprintId ?? sprint?.id ?? null}
        name={choice.sprintId === 'none' ? noSprintName : (sprint?.name ?? (loading ? null : '–'))}
        onPick={(sprintId) => {
          // No sprint keeps Your sprint's "yours"; a sprint belongs to the project listed.
          if (sprintId === 'none') choose.mutate({ projectKey: choice.projectKey, sprintId });
          else if (project !== null) choose.mutate({ projectKey: project, sprintId });
        }}
      />
    </>
  );
}

function SprintMenu({
  project,
  current,
  name,
  onPick,
}: {
  project: string | null;
  current: number | 'none' | null;
  name: string | null;
  onPick: (sprintId: number | 'none') => void;
}) {
  const [open, setOpen] = useState(false);
  const sprints = useTicketsSprints(project, open);
  const now = useNow();

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        <Picker className={pickerWidth}>
          <span className="text-muted-foreground">Sprint</span>{' '}
          {name ?? (
            // While the sprint loads: a bar where its name goes, the picker as wide as ever.
            <Skeleton className="inline-block h-3.5 w-16 align-middle" />
          )}
        </Picker>
      </MenuTrigger>
      <MenuContent heading="Sprint" align="start" size="sm">
        {project === null ? null : sprints.isPending ? (
          // Two rows the size of a sprint's (its name over its dates), so the list doesn't jump when they arrive.
          <div role="status" className="flex flex-col">
            <span className="sr-only">Loading sprints</span>
            {[0, 1].map((row) => (
              <span key={row} aria-hidden className="flex flex-col px-3 py-1">
                <span className="flex h-5 items-center">
                  <Skeleton className="h-3.5 w-24" />
                </span>
                <span className="flex h-4 items-center">
                  <Skeleton className="h-3 w-32" />
                </span>
              </span>
            ))}
          </div>
        ) : sprints.isError ? (
          <>
            <MenuLabel>Sprints didn&apos;t load.</MenuLabel>
            <MenuItem
              onSelect={(event) => {
                // Stays open, so the sprints show here once they load.
                event.preventDefault();
                void sprints.refetch();
              }}
            >
              Try again
            </MenuItem>
          </>
        ) : sprints.data.sprints.length === 0 ? (
          <MenuLabel>{noOpenSprintsText(project)}</MenuLabel>
        ) : null}
        <MenuRadioGroup
          value={current === null ? '' : String(current)}
          onValueChange={(value) => {
            onPick(value === 'none' ? 'none' : Number(value));
          }}
        >
          {project === null || !sprints.isSuccess
            ? null
            : sprints.data.sprints.map((found) => (
                <MenuRadioItem key={found.id} value={String(found.id)} description={openSprintLine(found, now)}>
                  {found.name}
                </MenuRadioItem>
              ))}
          {project === null ? null : <MenuSeparator />}
          <MenuRadioItem value="none">{noSprintName}</MenuRadioItem>
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
