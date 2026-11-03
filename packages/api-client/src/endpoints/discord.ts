import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ConnectionCheckSchema,
  DiscordConnectionSchema,
  type ConnectionCheck,
  type DiscordConnection,
  type DiscordConnectionRequest,
} from '@devhub/contracts';

export async function getDiscordConnection(http: AxiosInstance): Promise<DiscordConnection> {
  const res = await http.get<unknown>(apiRoutes.discordConnection);
  return DiscordConnectionSchema.parse(res.data);
}

/** The server checks the bot with Discord before it saves anything; a team’s bot answers user_id_needed (spec 016). */
export async function putDiscordConnection(
  http: AxiosInstance,
  request: DiscordConnectionRequest,
): Promise<DiscordConnection> {
  const res = await http.put<unknown>(apiRoutes.discordConnection, request);
  return DiscordConnectionSchema.parse(res.data);
}

/** Test connection and Reconnect (spec 030): the server asks Discord now. */
export async function postDiscordConnectionCheck(http: AxiosInstance): Promise<ConnectionCheck> {
  const res = await http.post<unknown>(apiRoutes.discordConnectionCheck);
  return ConnectionCheckSchema.parse(res.data);
}

export async function deleteDiscordConnection(http: AxiosInstance): Promise<void> {
  await http.delete(apiRoutes.discordConnection);
}
