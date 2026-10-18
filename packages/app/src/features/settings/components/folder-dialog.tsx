import { useId, useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { AddRepositoryRequestSchema, JiraProject, Repository } from '@devhub/contracts';
import { Folder01Icon } from '@hugeicons/core-free-icons';
import { Button, Dialog, DialogContent, DialogTitle, Field, Icon, Input, Select } from '@devhub/ui';
import type { z } from 'zod';
import {
  useAddRepository,
  useChooseFolder,
  useEditRepository,
  useJiraConnection,
  useJiraProjects,
} from '../queries.ts';
import { addFolderFormSchema, type AddFolderFormValues } from '../schemas.ts';

/**
 * What the folder dialog is for (spec 020): adding a folder, with the ticket's project picked when Ship's
 * menu opens it; editing a folder; or adding another entry filled in from a folder (Duplicate, Q3).
 */
export type FolderTask =
  | { kind: 'add'; jiraProject?: string | undefined }
  | { kind: 'edit'; folder: Repository }
  | { kind: 'duplicate'; folder: Repository };

export interface FolderDialogProps {
  /** Null while the dialog is closed. */
  task: FolderTask | null;
  onClose: () => void;
  /** The folder as the server saved it; the dialog has closed. */
  onSaved: (folder: Repository) => void;
  /** Where focus goes when the dialog closes; what had focus when it opened, unless this says otherwise. */
  returnFocusTo?: (() => HTMLElement | null) | undefined;
}

function titleOf(task: FolderTask): string {
  switch (task.kind) {
    case 'add':
      return 'Add a folder';
    case 'edit':
      return `Edit ${task.folder.name}`;
    case 'duplicate':
      return `Duplicate ${task.folder.name}`;
  }
}

/**
 * Settings › Repositories' dialog for a folder's path and the Jira project its tickets belong to (spec 005,
 * in a dialog since spec 020). The server checks the folder on disk; its reason goes under Folder. While a
 * save is on its way the dialog stays open, so its answer still shows.
 */
export function FolderDialog({ task, onClose, onSaved, returnFocusTo }: FolderDialogProps) {
  const add = useAddRepository();
  const edit = useEditRepository();
  const saving = add.isPending || edit.isPending;
  const titleId = useId();

  return (
    <Dialog
      open={task !== null}
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      {task === null ? null : (
        <DialogContent
          aria-labelledby={titleId}
          onCloseAutoFocus={(event) => {
            const target = returnFocusTo?.();
            if (target === null || target === undefined) return;
            event.preventDefault();
            target.focus();
          }}
        >
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
            <DialogTitle id={titleId}>{titleOf(task)}</DialogTitle>
            <FolderForm
              // A fresh form for each task, so a closed dialog never leaves its values behind.
              key={task.kind === 'add' ? `add-${task.jiraProject ?? ''}` : `${task.kind}-${task.folder.id}`}
              task={task}
              add={add}
              edit={edit}
              saving={saving}
              onSaved={onSaved}
              onCancel={onClose}
            />
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/** The projects to offer: the saved connection's, plus the one already picked, so it shows while they load. */
function projectOptions(projects: readonly JiraProject[] | undefined, picked: string | null): JiraProject[] {
  const listed = projects ?? [];
  if (picked === null || listed.some((project) => project.key === picked)) return [...listed];
  return [{ key: picked, name: '' }, ...listed];
}

function FolderForm({
  task,
  add,
  edit,
  saving,
  onSaved,
  onCancel,
}: {
  task: FolderTask;
  add: ReturnType<typeof useAddRepository>;
  edit: ReturnType<typeof useEditRepository>;
  saving: boolean;
  onSaved: (folder: Repository) => void;
  onCancel: () => void;
}) {
  const jira = useJiraConnection();
  const jiraConnected = jira.data !== undefined && jira.data.saved !== null;
  const projects = useJiraProjects(jiraConnected);
  const picked = task.kind === 'add' ? (task.jiraProject ?? null) : task.folder.jiraProject;
  const form = useForm<AddFolderFormValues, unknown, z.output<typeof AddRepositoryRequestSchema>>({
    resolver: zodResolver(addFolderFormSchema),
    defaultValues: { path: task.kind === 'add' ? '' : task.folder.displayPath, jiraProject: picked ?? '' },
  });
  const { errors } = form.formState;
  const save = task.kind === 'edit' ? edit : add;
  const options = projectOptions(projects.data?.projects, picked);
  const choose = useChooseFolder();

  function chooseFolder() {
    choose.mutate(undefined, {
      onSuccess: ({ path }) => {
        // Cancel in the picker leaves the field as it was (AC-35).
        if (path === null) return;
        form.setValue('path', path, { shouldDirty: true, shouldValidate: errors.path !== undefined });
      },
    });
  }

  // A second submit while the first is on its way sends nothing, even before the button shows it waits.
  const sending = useRef(false);
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    const done = () => {
      sending.current = false;
    };
    const handlers = {
      onSuccess: onSaved,
      onError: (error: { code: string; message: string }) => {
        if (error.code === 'folder_rejected') form.setError('path', { message: error.message }, { shouldFocus: true });
      },
      onSettled: done,
    };
    void form.handleSubmit((request) => {
      if (task.kind === 'edit') edit.mutate({ id: task.folder.id, request }, handlers);
      else add.mutate(request, handlers);
    }, done)(event);
  }

  const projectHelp =
    jira.data !== undefined && !jiraConnected
      ? 'Connect Jira in Connections to pick a project.'
      : projects.isError
        ? "Your Jira projects didn't load. Add the folder without one, or try again later."
        : 'Tickets from this project open in this folder.';
  const formError = save.error && save.error.code !== 'folder_rejected' ? save.error.message : undefined;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <Field
        label="Folder"
        help="The folder's full path, for example ~/code/intranet-web."
        error={errors.path?.message}
      >
        <div className="flex flex-wrap gap-2">
          <Input
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 basis-60 font-mono"
            {...form.register('path')}
          />
          {/* The computer's own picker, through the server: a page never learns a folder's full path (AC-35). */}
          <Button variant="secondary" pending={choose.isPending} onClick={chooseFolder}>
            <Icon icon={Folder01Icon} aria-hidden />
            Choose folder
          </Button>
        </div>
      </Field>
      {choose.error === null ? null : (
        // No picker here, or the server out of reach: the path can still be typed (AC-36).
        <p role="status" className="m-0 -mt-2 text-small text-muted-foreground">
          {choose.error.message}
        </p>
      )}
      <Field label="Jira project" help={projectHelp}>
        <Select disabled={options.length === 0} {...form.register('jiraProject')}>
          <option value="">No Jira project</option>
          {options.map((project) => (
            <option key={project.key} value={project.key}>
              {project.name === '' ? project.key : `${project.key} · ${project.name}`}
            </option>
          ))}
        </Select>
      </Field>
      {formError === undefined ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {formError}
        </p>
      )}
      {/* A dialog's actions sit at its end, the primary one last (the user's call, 18 Oct 2026). */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          // Once the folder is on its way, closing the dialog can't stop it from saving.
          aria-disabled={saving || undefined}
          onClick={() => {
            if (!saving) onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" pending={save.isPending}>
          {task.kind === 'edit' ? 'Save changes' : 'Add folder'}
        </Button>
      </div>
    </form>
  );
}
