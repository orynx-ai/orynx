import { useRef, type SubmitEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import {
  OrynxPrioritySchema,
  OrynxTicketFieldsSchema,
  OrynxTicketTypeSchema,
  orynxStatusNames,
  TicketColumnSchema,
  type OrynxTicketFields,
} from '@devhub/contracts';
import {
  Button,
  DatePicker,
  DialogFoot,
  DialogTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@devhub/ui';
import { orynxTicketWords as words } from '../ticket-words.ts';

export interface TicketFormProps {
  /** "New ticket", or "Edit ORX-3". */
  heading: string;
  headingId: string;
  defaults: OrynxTicketFields;
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

/**
 * An Orynx ticket's form (spec 037, Q11), the same for New ticket and Edit: Title, Description, then Type, Priority and
 * Status side by side (stacked under 640 px), then Due date, with Cancel and the action at the dialog's foot. The
 * contract's own schema checks it, so the form and the server refuse the same values with the same words (Q12d).
 * Enter in Title submits; a second submit while the first is on its way sends nothing.
 */
export function TicketForm({
  heading,
  headingId,
  defaults,
  submitLabel,
  saving,
  problem,
  onSubmit,
  onCancel,
}: TicketFormProps) {
  const form = useForm<OrynxTicketFields, unknown, OrynxTicketFields>({
    resolver: zodResolver(OrynxTicketFieldsSchema),
    defaultValues: defaults,
  });
  const { errors } = form.formState;
  const sending = useRef(false);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || saving) return;
    sending.current = true;
    void form
      .handleSubmit(onSubmit)(event)
      .finally(() => {
        sending.current = false;
      });
  }

  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6">
        <DialogTitle id={headingId}>{heading}</DialogTitle>
        <Field label={words.fields.title} error={errors.title?.message}>
          <Input autoComplete="off" {...form.register('title')} />
        </Field>
        <Field label={words.fields.description} error={errors.description?.message}>
          <Textarea rows={6} {...form.register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
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
                    {OrynxTicketTypeSchema.options.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
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
        <Button type="submit" variant="primary" pending={saving}>
          {submitLabel}
        </Button>
      </DialogFoot>
    </form>
  );
}
