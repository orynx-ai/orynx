import type { AxiosInstance } from 'axios';
import { apiRoutes, TicketsSchema, type Tickets } from '@devhub/contracts';

export async function getTickets(http: AxiosInstance): Promise<Tickets> {
  const res = await http.get<unknown>(apiRoutes.tickets);
  return TicketsSchema.parse(res.data);
}
