import type { AxiosInstance } from 'axios';
import {
  AddTerminalTabAnswerSchema,
  apiRoutes,
  ClaudeCommandListSchema,
  RunCommandAnswerSchema,
  RunCommandRequestSchema,
  SendMessageAnswerSchema,
  TerminalSchema,
  type AddTerminalTabAnswer,
  type ClaudeCommandList,
  type RunCommandAnswer,
  type SendMessageAnswer,
  type Terminal,
} from '@devhub/contracts';

/** A session's Terminal (spec 036): the commands Claude ran, and your shell tabs. */

const pathFor = (route: string, id: string, tabId = '', blockId = '') =>
  route
    .replace(':id', encodeURIComponent(id))
    .replace(':tabId', encodeURIComponent(tabId))
    .replace(':blockId', encodeURIComponent(blockId));

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

export async function postTerminalRun(
  http: AxiosInstance,
  id: string,
  tabId: string,
  command: string,
): Promise<RunCommandAnswer> {
  const res = await http.post<unknown>(
    pathFor(apiRoutes.sessionTerminalRun, id, tabId),
    RunCommandRequestSchema.parse({ command }),
  );
  return RunCommandAnswerSchema.parse(res.data);
}

export async function postTerminalStop(http: AxiosInstance, id: string, tabId: string): Promise<void> {
  await http.post(pathFor(apiRoutes.sessionTerminalStop, id, tabId));
}

export async function deleteTerminalBlocks(http: AxiosInstance, id: string, tabId: string): Promise<void> {
  await http.delete(pathFor(apiRoutes.sessionTerminalBlocks, id, tabId));
}

export async function postTerminalFix(
  http: AxiosInstance,
  id: string,
  tabId: string,
  blockId: string,
): Promise<SendMessageAnswer> {
  const res = await http.post<unknown>(pathFor(apiRoutes.sessionTerminalFix, id, tabId, blockId));
  return SendMessageAnswerSchema.parse(res.data);
}
