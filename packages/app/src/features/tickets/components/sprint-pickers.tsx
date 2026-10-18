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
  MenuTrigger,
  Picker,
  Skeleton,
} from '@devhub/ui';
import { useJiraConnection, useJiraProjects } from '../../settings/queries.ts';
import { useNow } from '../../../words/use-now.ts';
import { useChooseTicketsSprint, useTicketsSprints } from '../queries.ts';
import { noOpenSprintsText, openSprintLine, yourSprintText } from '../ticket-words.ts';

/**
 * Tickets' Project and Sprint pickers (spec 020). Project searches the Jira projects you can see, with Your
 * sprint first (AC-38); picking one shows its current sprint. Sprint lists that project's active then future
 * sprints, asked of Jira when it opens; picking one holds it. With Your sprint, Sprint lists the sprint's own
 * project when its board has one.
 */
export function SprintPickers({ choice, sprint }: { choice: TicketsChoice; sprint: Sprint | null }) {
  const jira = useJiraConnection();
  const projects = useJiraProjects(jira.data !== undefined && jira.data.saved !== null);
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
      >
        <Picker>
          <span className="text-muted-foreground">Project</span> {choice.projectKey ?? yourSprintText}
        </Picker>
      </Combobox>
      <SprintMenu
        project={project}
        current={choice.sprintId ?? sprint?.id ?? null}
        name={sprint?.name ?? null}
        onPick={(sprintId) => {
          if (project !== null) choose.mutate({ projectKey: project, sprintId });
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
  current: number | null;
  name: string | null;
  onPick: (sprintId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const sprints = useTicketsSprints(project, open);
  const now = useNow();

  return (
    <Menu open={open} onOpenChange={setOpen}>
      {/* A sprint without one project to list has nothing else to offer. */}
      <MenuTrigger asChild disabled={project === null}>
        <Picker>
          <span className="text-muted-foreground">Sprint</span> {name ?? '–'}
        </Picker>
      </MenuTrigger>
      <MenuContent heading="Sprint" align="start">
        {sprints.isPending ? (
          <div role="status" className="flex flex-col gap-1 p-1.5">
            <span className="sr-only">Loading sprints</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
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
          <MenuLabel>{noOpenSprintsText(project ?? '')}</MenuLabel>
        ) : (
          <MenuRadioGroup
            value={current === null ? '' : String(current)}
            onValueChange={(value) => {
              onPick(Number(value));
            }}
          >
            {sprints.data.sprints.map((open) => (
              <MenuRadioItem key={open.id} value={String(open.id)} description={openSprintLine(open, now)}>
                {open.name}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        )}
      </MenuContent>
    </Menu>
  );
}
