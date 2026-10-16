import { isAxiosError } from 'axios';
import { ApiErrorSchema, type ApiErrorCode } from '@devhub/contracts';

/** Every failed request rejects with this, so screens can branch on `code` without knowing axios. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode | 'network';
  /** HTTP status, or null when the server could not be reached. */
  readonly status: number | null;

  constructor(code: ApiErrorCode | 'network', message: string, status: number | null) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export function toApiRequestError(error: unknown): ApiRequestError {
  if (error instanceof ApiRequestError) return error;
  if (isAxiosError(error)) {
    if (!error.response) {
      return new ApiRequestError('network', 'Could not reach the DevHub server on this computer.', null);
    }
    const body = ApiErrorSchema.safeParse(error.response.data);
    if (body.success) return new ApiRequestError(body.data.code, body.data.message, error.response.status);
    return new ApiRequestError(
      'internal',
      `The DevHub server answered ${String(error.response.status)}.`,
      error.response.status,
    );
  }
  if (error instanceof Error && error.name === 'ZodError') {
    return new ApiRequestError(
      'internal',
      'The DevHub server sent data this page does not understand. Reload the page.',
      null,
    );
  }
  return new ApiRequestError('internal', error instanceof Error ? error.message : 'Unknown error.', null);
}
