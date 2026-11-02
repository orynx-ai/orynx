import { useRef, type ReactNode, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  OrynxPrioritySchema,
  OrynxTicketTypeSchema,
  orynxStatusNames,
  TicketColumnSchema,
  type JiraTicketType,
  type NewJiraTicket,
  type OrynxTicketFields,
} from '@devhub/contracts';
import {
  Button,
  DatePicker,
  DialogFoot,
  DialogTitle,
  Field,
  Input,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@devhub/ui';
import { priorityIn, TicketFormSchema, typeIn, type TicketFormValues } from '../schemas.ts';
import { orynxTicketWords as words } from '../ticket-words.ts';

/** What a new Jira ticket's form sends (spec 019); the dialog adds the project and the sprint. */
export type JiraTicketFields = Pick<
  NewJiraTicket,
  'title' | 'description' | 'column' | 'typeId' | 'priorityId' | 'dueDate'
>;

/** A Jira project's types as the form shows them (spec 019): on their way, refused with Try again, or here. */
export type JiraTypesState =
  { state: 'loading' } | { state: 'failed'; retry: () => void } | { state: 'ready'; types: JiraTicketType[] };

/** A new ticket that can go to Jira (spec 019): the project Tickets shows, the line saying so, and its types. */
export interface TicketFormJira {
  project: string;
  /** The line under the heading while Jira is picked. */
  note: ReactNode;
  /** Orynx is on offer too, so Save in shows (AC-7). */
  orynx: boolean;
  types: JiraTypesState;
  onSubmit: (fields: JiraTicketFields) => Promise<unknown>;
}

export interface TicketFormProps {
  /** "New ticket", or "Edit ORX-3". */
  heading: string;
  headingId: string;
  /** One quiet line under the heading, such as where a new ticket goes (spec 039). */
  note?: ReactNode;
  defaults: OrynxTicketFields;
  /** Jira as well as Orynx, picked by Save in and first (spec 019, Q1); left out, the form is Orynx's alone. */
  jira?: TicketFormJira | undefined;
  /** "Create ticket" or "Save changes". */
  submitLabel: string;
  saving: boolean;
  /** One line above the buttons: a save that failed, or a ticket someone else saved first (Q12e). */
  problem: string | null;
  /** Saves; the form takes no second submit until what this returns has settled. */
  onSubmit: (fields: OrynxTicketFields) => Promise<unknown>;
  onCancel: () => void;
}

const statusOptions = TicketColumnSchema.options.map((value) => ({ value, label: orynxStatusNames[value] }));

/** A label over a select-sized block, while a Jira project's types are on their way (spec 019, AC-2). */
function SkeletonField({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-small font-medium text-foreground">{label}</span>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

/**
 * A ticket's form (spec 037, Q11), the same for New ticket and Edit: Title, Description, then Type, Priority and
 * Status side by side (stacked under 640 px), then Due date, with Cancel and the action at the dialog's foot. The
 * contract's own schema checks it, so the form and the server refuse the same values with the same words (Q12d).
 * Enter in Title submits; a second submit while the first is on its way sends nothing.
 *
 * A new ticket can go to Jira too (spec 019): Save in sits under the heading, and on Jira, Type and Priority are the
 * project's own, Due date shows when the type has one, and Create ticket waits for the types. Switching keeps
 * everything typed (AC-5).
 */
export function TicketForm({
  heading,
  headingId,
  note,
  defaults,
  jira,
  submitLabel,
  saving,
  problem,
  onSubmit,
  onCancel,
}: TicketFormProps) {
  const form = useForm<TicketFormValues>({
    resolver: zodResolver(TicketFormSchema),
    defaultValues: { ...defaults, place: jira === undefined ? 'orynx' : 'jira', jiraType: '', jiraPriority: '' },
  });
  const { errors } = form.formState;
  const sending = useRef(false);
  const [place, jiraType] = useWatch({ control: form.control, name: ['place', 'jiraType'] });
  const onJira = jira !== undefined && place === 'jira';
  const types = onJira && jira.types.state === 'ready' ? jira.types.types : null;
  // Undefined while the types are on their way, refused, or the project has none: there's nothing to send yet.
  const type = types === null ? undefined : typeIn(types, jiraType);

  function send({ place: to, jiraType: _, jiraPriority, ...fields }: TicketFormValues): Promise<unknown> {
    if (to === 'orynx' || jira === undefined) return onSubmit(fields);
    if (type === undefined) return Promise.resolve();
    return jira.onSubmit({
      title: fields.title,
      description: fields.description,
      column: fields.status,
      typeId: type.id,
      priorityId: priorityIn(type, jiraPriority),
      dueDate: type.dueDate ? fields.dueDate : null,
    });
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || saving) return;
    sending.current = true;
    void form
      .handleSubmit(send)(event)
      .finally(() => {
        sending.current = false;
      });
  }

  const orynxFields = (
    <>
      <Field label={words.fields.type}>
        <Controller
          control={form.control}
          name="type"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OrynxTicketTypeSchema.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <Field label={words.fields.priority}>
        <Controller
          control={form.control}
          name="priority"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OrynxPrioritySchema.options.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {priority}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
    </>
  );

  function jiraFields(state: JiraTypesState, project: string) {
    if (state.state === 'loading' || (state.state === 'ready' && type === undefined)) {
      return (
        <>
          <SkeletonField label={words.fields.type} />
          <SkeletonField label={words.fields.priority} />
        </>
      );
    }
    if (state.state === 'failed') {
      return (
        <div role="alert" className="flex flex-col items-start gap-2 sm:col-span-2">
          <p className="m-0 text-small text-danger">{words.typesFailed(project)}</p>
          <Button size="sm" variant="secondary" onClick={state.retry}>
            {words.tryAgain}
          </Button>
        </div>
      );
    }
    if (type === undefined) return null;
    return (
      <>
        <Field label={words.fields.type}>
          <Controller
            control={form.control}
            name="jiraType"
            render={({ field }) => (
              <Select value={type.id} onValueChange={field.onChange}>
                <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.types.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        {type.priorities.length === 0 ? null : (
          <Field label={words.fields.priority}>
            <Controller
              control={form.control}
              name="jiraPriority"
              render={({ field }) => (
                <Select value={priorityIn(type, field.value) ?? ''} onValueChange={field.onChange}>
                  <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {type.priorities.map((priority) => (
                      <SelectItem key={priority.id} value={priority.id}>
                        {priority.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        )}
      </>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
        <div className="flex flex-col gap-1">
          <DialogTitle id={headingId}>{heading}</DialogTitle>
          {jira?.orynx === true ? (
            <Controller
              control={form.control}
              name="place"
              render={({ field }) => (
                <SegmentedControl
                  aria-label={words.saveIn}
                  value={field.value}
                  onValueChange={field.onChange}
                  className="mt-2 self-start"
                >
                  <SegmentedControlItem value="jira">{words.jiraPlace(jira.project)}</SegmentedControlItem>
                  <SegmentedControlItem value="orynx">{words.orynxPlace}</SegmentedControlItem>
                </SegmentedControl>
              )}
            />
          ) : null}
          {onJira ? jira.note : note}
        </div>
        <Field label={words.fields.title} error={errors.title?.message}>
          <Input autoComplete="off" {...form.register('title')} />
        </Field>
        <Field label={words.fields.description} error={errors.description?.message}>
          <Textarea rows={6} {...form.register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          {onJira ? jiraFields(jira.types, jira.project) : orynxFields}
          <Field label={words.fields.status}>
            <Controller
              control={form.control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger ref={field.ref} onBlur={field.onBlur}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        {/* On Jira, only a type whose create screen has one; while the types come, it holds its place (AC-4, AC-16). */}
        {onJira && type !== undefined && !type.dueDate ? null : (
          <Field label={words.fields.dueDate} className="sm:max-w-60">
            <Controller
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <DatePicker
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder={words.pickDate}
                  clearLabel={words.clearDate}
                />
              )}
            />
          </Field>
        )}
        {problem === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {problem}
          </p>
        )}
      </div>
      <DialogFoot>
        <Button variant="secondary" onClick={onCancel}>
          {words.cancel}
        </Button>
        <Button type="submit" variant="primary" pending={saving} disabled={onJira && type === undefined}>
          {submitLabel}
        </Button>
      </DialogFoot>
    </form>
  );
}
