import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  OrynxTicketAnswerSchema,
  OrynxTicketDeleteAnswerSchema,
  OrynxTicketSaveAnswerSchema,
  OrynxTicketSchema,
  type CreateOrynxTicket,
  type OrynxTicket,
  type OrynxTicketAnswer,
  type OrynxTicketDeleteAnswer,
  type OrynxTicketSaveAnswer,
  type UpdateOrynxTicket,
} from '@devhub/contracts';

const ticketRoute = (key: string) => apiRoutes.orynxTicket.replace(':key', encodeURIComponent(key));

/** Makes one of Orynx's own tickets (spec 037). */
export async function postOrynxTicket(http: AxiosInstance, ticket: CreateOrynxTicket): Promise<OrynxTicket> {
  const res = await http.post<unknown>(apiRoutes.orynxTickets, ticket);
  return OrynxTicketSchema.parse(res.data);
}

export async function getOrynxTicket(http: AxiosInstance, key: string): Promise<OrynxTicketAnswer> {
  const res = await http.get<unknown>(ticketRoute(key));
  return OrynxTicketAnswerSchema.parse(res.data);
}

/** Saves a change; `changed` when someone saved first and the change carried the version it was opened at. */
export async function patchOrynxTicket(
  http: AxiosInstance,
  key: string,
  change: UpdateOrynxTicket,
): Promise<OrynxTicketSaveAnswer> {
  const res = await http.patch<unknown>(ticketRoute(key), change);
  return OrynxTicketSaveAnswerSchema.parse(res.data);
}

export async function deleteOrynxTicket(http: AxiosInstance, key: string): Promise<OrynxTicketDeleteAnswer> {
  const res = await http.delete<unknown>(ticketRoute(key));
  return OrynxTicketDeleteAnswerSchema.parse(res.data);
}
