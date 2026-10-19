import type { AxiosInstance } from 'axios';
import {
  apiRoutes,
  FileCheckAnswerSchema,
  FilePicksSchema,
  type FileCheckAnswer,
  type FileCheckRequest,
  type FilePicks,
} from '@devhub/contracts';

/** Opens the computer's file picker (spec 022); null paths when the person pressed Cancel. */
export async function postFilePicker(http: AxiosInstance): Promise<FilePicks> {
  // The picker waits for the person, so this asks with no time limit of its own.
  const res = await http.post<unknown>(apiRoutes.filePicker, undefined, { timeout: 0 });
  return FilePicksSchema.parse(res.data);
}

/** Checks a typed path when no picker can open (spec 022, AC-12). */
export async function postFileCheck(http: AxiosInstance, request: FileCheckRequest): Promise<FileCheckAnswer> {
  const res = await http.post<unknown>(apiRoutes.fileCheck, request);
  return FileCheckAnswerSchema.parse(res.data);
}
