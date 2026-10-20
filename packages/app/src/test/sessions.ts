import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { apiRoutes, type SessionList, type SessionSummary } from '@devhub/contracts';
import { makeSessionList } from '@devhub/contracts/testing';
import { apiUrl, server, sessionsPage } from './msw.ts';

/** Helpers for spec 039's session actions: the sidebar, a server whose sessions change, and a row's ⋯ menu. */
export function mainNav() {
  return screen.getByRole('navigation', { name: 'Main' });
}

/** The server's sessions, changed by the PATCH and DELETE it answers, as the real one is. */
export function serveSessions(items: Partial<SessionSummary>[], { failPatch = false } = {}) {
  let list: SessionList = makeSessionList(items);
  const patched: unknown[] = [];
  const deleted: string[] = [];
  server.use(
    http.get(apiUrl(apiRoutes.sessions), ({ request }) => HttpResponse.json(sessionsPage(list, request.url))),
    http.patch(apiUrl(apiRoutes.session), async ({ request, params }) => {
      if (failPatch) return HttpResponse.json({ code: 'internal', message: 'No.' }, { status: 500 });
      const change = (await request.json()) as { title?: string; pinned?: boolean };
      patched.push(change);
      list = {
        ...list,
        sessions: list.sessions.map((session) =>
          session.id === params['id']
            ? {
                ...session,
                title: change.title ?? session.title,
                pinnedAt: change.pinned === undefined ? session.pinnedAt : change.pinned ? session.updatedAt : null,
              }
            : session,
        ),
      };
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(apiUrl(apiRoutes.session), ({ params }) => {
      const id = String(params['id']);
      deleted.push(id);
      list = { ...list, sessions: list.sessions.filter((session) => session.id !== id) };
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return { patched, deleted };
}

export async function openSessionMenu(user: UserEvent, title: string) {
  const more = await within(mainNav()).findByRole('button', { name: `More actions for ${title}` });
  await user.click(more);
  return { more, menu: await screen.findByRole('menu') };
}
