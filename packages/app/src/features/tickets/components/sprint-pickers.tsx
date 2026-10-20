import { useState } from 'react';
import type { Sprint, TicketsChoice } from '@devhub/contracts';
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
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

/**
 * Where the pickers sit (spec 039): `bar` as the page bar's crumbs, "Tickets / MAI ▾ / No sprint ▾", their names for
 * screen readers only and a long sprint cut short; `sheet` in the filter sheet, named and both the same width
 * (spec 020), so neither moves when its words change.
 */
export type PickersPlace = 'bar' | 'sheet';

const pickerLooks: Record<PickersPlace, { className: string; label: string }> = {
  bar: { className: 'text-body', label: 'sr-only' },
  sheet: { className: 'w-48 justify-between', label: 'text-muted-foreground' },
};

/**
 * Tickets' Project and Sprint pickers (spec 020). Project searches the Jira projects you can see, with Your
 * sprint first (AC-38); picking one shows its current sprint. Sprint lists that project's active then future
 * sprints, asked of Jira when it opens; picking one holds it. With Your sprint, Sprint lists the sprint's own
 * project when its board has one. No sprint heads the list (AC-39; first since the user's call, 19 Oct 2026):
 * the picked project's tickets in no sprint, or with Your sprint, your own.
 */
export function SprintPickers({
  choice,
  sprint,
  loading = false,
  place,
}: {
  choice: TicketsChoice;
  sprint: Sprint | null;
  /** The sprint is on its way, so Sprint shows a bar where its name goes. */
  loading?: boolean;
  place: PickersPlace;
}) {
  const look = pickerLooks[place];
  const jira = useJiraConnection();
  // Jira's project list is asked for while Project is open, not on every visit to Tickets or window focus.
  const [listing, setListing] = useState(false);
  const projects = useJiraProjects(listing && jira.data !== undefined && jira.data.saved !== null);
  const choose = useChooseTicketsSprint();
  // Whose sprints the Sprint menu lists: the picked project, or Your sprint's own.
  const project = choice.projectKey ?? sprint?.projectKey ?? null;

  const projectPicker = (
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
      onOpenChange={setListing}
    >
      <Picker variant="plain" className={look.className}>
        <span className={look.label}>Project</span> {choice.projectKey ?? yourSprintText}
      </Picker>
    </Combobox>
  );
  const sprintName = choice.sprintId === 'none' ? noSprintName : (sprint?.name ?? (loading ? null : '–'));
  const sprintPicker = (
    <SprintMenu
      project={project}
      current={choice.sprintId ?? sprint?.id ?? null}
      name={sprintName}
      look={look}
      onPick={(sprintId) => {
        // No sprint keeps Your sprint's "yours"; a sprint belongs to the project listed.
        if (sprintId === 'none') choose.mutate({ projectKey: choice.projectKey, sprintId });
        else if (project !== null) choose.mutate({ projectKey: project, sprintId });
      }}
    />
  );
  // A pick that doesn't save is said once, by the page (useTicketsChoiceFailed), not beside the pickers.
  if (place === 'sheet') {
    return (
      <>
        {projectPicker}
        {sprintPicker}
      </>
    );
  }
  return (
    <>
      <BreadcrumbItem className="min-w-0">{projectPicker}</BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem className="min-w-0">{sprintPicker}</BreadcrumbItem>
    </>
  );
}

function SprintMenu({
  project,
  current,
  name,
  look,
  onPick,
}: {
  project: string | null;
  current: number | 'none' | null;
  name: string | null;
  look: { className: string; label: string };
  onPick: (sprintId: number | 'none') => void;
}) {
  const [open, setOpen] = useState(false);
  const sprints = useTicketsSprints(project, open);
  const now = useNow();
  const loading = open && project !== null && sprints.isPending;

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger asChild>
        {/* A long sprint name is cut short; its tooltip holds it whole (spec 039, AC-12). */}
        <Picker variant="plain" className={look.className} title={name ?? undefined}>
          <span className={look.label}>Sprint</span>{' '}
          {name ?? (
            // While the sprint loads: a bar where its name goes, the picker as wide as ever.
            <Skeleton className="inline-block h-3.5 w-16 align-middle" />
          )}
        </Picker>
      </MenuTrigger>
      {/* A menu holds menu items alone (ARIA), and while open it hides the page around it, so the menu itself
            says it's busy; the loading rows are only drawn. */}
      <MenuContent heading="Sprint" align="start" size="sm" aria-busy={loading || undefined}>
        {/* No sprint first, so it never moves however the sprints load (the user's call, 19 Oct 2026). */}
        <MenuRadioGroup
          value={current === 'none' ? 'none' : ''}
          onValueChange={() => {
            onPick('none');
          }}
        >
          <MenuRadioItem value="none">{noSprintName}</MenuRadioItem>
        </MenuRadioGroup>
        {project === null ? null : <MenuSeparator />}
        {project === null ? null : sprints.isPending ? (
          // Two rows the size of a sprint's (its name over its dates), so the list doesn't jump when they arrive.
          <div aria-hidden className="flex flex-col">
            {[0, 1].map((row) => (
              <span key={row} className="flex flex-col px-3 py-1">
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
            onPick(Number(value));
          }}
        >
          {project === null || !sprints.isSuccess
            ? null
            : sprints.data.sprints.map((found) => (
                <MenuRadioItem key={found.id} value={String(found.id)} description={openSprintLine(found, now)}>
                  {found.name}
                </MenuRadioItem>
              ))}
        </MenuRadioGroup>
      </MenuContent>
    </Menu>
  );
}
