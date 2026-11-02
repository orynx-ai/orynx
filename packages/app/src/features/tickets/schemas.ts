import { z } from 'zod';
import { OrynxTicketFieldsSchema, type JiraTicketType } from '@devhub/contracts';

/**
 * The New ticket and Edit form (specs 037, 019): an Orynx ticket's fields, where a new one is saved, and Jira's type
 * and priority by id, empty until picked. The contract's own fields, so the form and the server refuse the same values
 * with the same words.
 */
export const TicketFormSchema = OrynxTicketFieldsSchema.extend({
  place: z.enum(['jira', 'orynx']),
  jiraType: z.string(),
  jiraPriority: z.string(),
});
export type TicketFormValues = z.infer<typeof TicketFormSchema>;

/** The picked type, else Task when the project has one, else Jira's first (Q2). */
export function typeIn(types: readonly JiraTicketType[], picked: string): JiraTicketType | undefined {
  return types.find((type) => type.id === picked) ?? types.find((type) => type.name === 'Task') ?? types[0];
}

/** The picked priority while the type allows it, else Medium, else the type's default, else its first (AC-4). */
export function priorityIn(type: JiraTicketType, picked: string): string | null {
  const ids = type.priorities.map((priority) => priority.id);
  if (ids.includes(picked)) return picked;
  const medium = type.priorities.find((priority) => priority.name === 'Medium')?.id;
  const preset =
    type.defaultPriorityId !== null && ids.includes(type.defaultPriorityId) ? type.defaultPriorityId : null;
  return medium ?? preset ?? ids[0] ?? null;
}
