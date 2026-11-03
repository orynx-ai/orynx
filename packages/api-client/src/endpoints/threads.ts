import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  ThreadPreviewAnswerSchema,
  ThreadReplyAnswerSchema,
  type ThreadPreviewAnswer,
  type ThreadReplyAnswer,
  type ThreadReplyRequest,
} from '@devhub/contracts';

/** The thread a pasted Slack or Discord link names, as its chip will read (spec 016, AC-26). */
export async function getThreadPreview(http: AxiosInstance, link: string): Promise<ThreadPreviewAnswer> {
  const res = await http.get<unknown>(apiRoutes.threadPreview, { params: { link } });
  return ThreadPreviewAnswerSchema.parse(res.data);
}

/** Post reply: the pull request's link in the session's thread, on your press only (spec 016, E). */
export async function postThreadReply(
  http: AxiosInstance,
  id: string,
  request: ThreadReplyRequest,
): Promise<ThreadReplyAnswer> {
  const res = await http.post<unknown>(apiRoutes.sessionThreadReply.replace(':id', encodeURIComponent(id)), request);
  return ThreadReplyAnswerSchema.parse(res.data);
}

/** Not now: the reply stays put off for this session (spec 016, AC-43). */
export async function postThreadReplyDismiss(http: AxiosInstance, id: string): Promise<void> {
  await http.post(apiRoutes.sessionThreadReplyDismiss.replace(':id', encodeURIComponent(id)));
}
