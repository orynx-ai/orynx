import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  JiraTicketTypesSchema,
  NewJiraTicketAnswerSchema,
  OpenSprintsSchema,
  TicketDetailAnswerSchema,
  TicketsSchema,
  type JiraTicketTypes,
  type NewJiraTicket,
  type NewJiraTicketAnswer,
  type OpenSprints,
  type TicketDetailAnswer,
  type Tickets,
  type TicketsChoice,
} from '@devhub/contracts';

export async function getTickets(http: AxiosInstance): Promise<Tickets> {
  const res = await http.get<unknown>(apiRoutes.tickets);
  return TicketsSchema.parse(res.data);
}

/** A project's open sprints, for Tickets' Sprint menu (spec 020); the server asks Jira now. */
export async function getTicketsSprints(http: AxiosInstance, project: string): Promise<OpenSprints> {
  const res = await http.get<unknown>(apiRoutes.ticketsSprints, { params: { project } });
  return OpenSprintsSchema.parse(res.data);
}

/** Saves which sprint Tickets shows (spec 020); its first sync starts at once. */
export async function putTicketsChoice(http: AxiosInstance, choice: TicketsChoice): Promise<void> {
  await http.put(apiRoutes.ticketsChoice, choice);
}

/** A project's types for a new Jira ticket (spec 019); the server asks Jira now. */
export async function getJiraTicketTypes(http: AxiosInstance, project: string): Promise<JiraTicketTypes> {
  const res = await http.get<unknown>(apiRoutes.jiraTicketTypes, { params: { project } });
  return JiraTicketTypesSchema.parse(res.data);
}

/** Makes a Jira ticket (spec 019), and says what came of it. */
export async function postJiraTicket(http: AxiosInstance, ticket: NewJiraTicket): Promise<NewJiraTicketAnswer> {
  const res = await http.post<unknown>(apiRoutes.jiraTickets, ticket);
  return NewJiraTicketAnswerSchema.parse(res.data);
}

/** One ticket in full for the ticket dialog (spec 022); the server asks Jira now. */
export async function getTicket(http: AxiosInstance, key: string): Promise<TicketDetailAnswer> {
  const res = await http.get<unknown>(apiRoutes.ticket.replace(':key', encodeURIComponent(key)));
  return TicketDetailAnswerSchema.parse(res.data);
}
