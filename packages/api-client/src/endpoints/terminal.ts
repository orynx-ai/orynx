import type { AxiosInstance } from 'axios';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ClaudeCommandListSchema,
  PortActionAnswerSchema,
  SessionPortsSchema,
  TerminalInputSchema,
  TerminalSchema,
  TerminalSizeSchema,
  type AddTerminalTabAnswer,
  type ClaudeCommandList,
  type PortActionAnswer,
  type SessionPort,
  type Terminal,
  type TerminalSize,
} from '@devhub/contracts';

/** A session's Terminal (spec 036, spec 038): the commands Claude ran, and your shell tabs. */

export const pathFor = (route: string, id: string, tabId = '') =>
  route.replace(':id', encodeURIComponent(id)).replace(':tabId', encodeURIComponent(tabId));

export async function getSessionCommands(http: AxiosInstance, id: string): Promise<ClaudeCommandList> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionCommands, id));
  return ClaudeCommandListSchema.parse(res.data);
}

export async function getTerminal(http: AxiosInstance, id: string): Promise<Terminal> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionTerminal, id));
  return TerminalSchema.parse(res.data);
}

export async function postTerminalTab(http: AxiosInstance, id: string): Promise<AddTerminalTabAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionTerminalTabs, id));
  return AddTerminalTabAnswerSchema.parse(res.data);
}

export async function deleteTerminalTab(http: AxiosInstance, id: string, tabId: string): Promise<void> {
  await http.delete(pathFor(apiRoutes.sessionTerminalTab, id, tabId));
}

export async function postTerminalInput(http: AxiosInstance, id: string, tabId: string, data: string): Promise<void> {
  await http.post(pathFor(apiRoutes.sessionTerminalInput, id, tabId), TerminalInputSchema.parse({ data }));
}

export async function postTerminalSize(
  http: AxiosInstance,
  id: string,
  tabId: string,
  size: TerminalSize,
): Promise<void> {
  await http.post(pathFor(apiRoutes.sessionTerminalSize, id, tabId), TerminalSizeSchema.parse(size));
}

/** What listens from the session (spec 042), lowest port first. */
export async function getSessionPorts(http: AxiosInstance, id: string): Promise<SessionPort[]> {
  const res = await http.get<unknown>(pathFor(apiRoutes.sessionPorts, id));
  return SessionPortsSchema.parse(res.data).ports;
}

/** Stops or restarts what listens on `port` (spec 042). */
export async function postPortAction(
  http: AxiosInstance,
  id: string,
  port: number,
  action: 'stop' | 'restart',
): Promise<PortActionAnswer> {
  const route = action === 'stop' ? apiRoutes.sessionPortStop : apiRoutes.sessionPortRestart;
  const res = await http.post<unknown>(pathFor(route, id).replace(':port', String(port)));
  return PortActionAnswerSchema.parse(res.data);
}
