import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  OpenSprintsSchema,
  TicketsSchema,
  type OpenSprints,
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
