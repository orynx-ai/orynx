import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { apiRoutes, tokenHeader } from '@devhub/contracts';
import { makeSkill, makeSkillList } from '@devhub/contracts/testing';
import { ApiRequestError, createApiClient, queryKeys, skillsQueryOptions } from './index.ts';

const baseURL = 'http://127.0.0.1:4317';
const listUrl = `${baseURL}${apiRoutes.skills}`;
const skillUrl = `${baseURL}${apiRoutes.skill}`;
const server = setupServer();
const api = createApiClient({ baseURL, token: 'abc' });

const fields = { title: 'Bug bash', description: 'Hunt for bugs.', instructions: '# Bug bash\n' };

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

describe('skills endpoints', () => {
  it('AC-2: lists your skills with the page token', async () => {
    let token: string | null = null;
    server.use(
      http.get(listUrl, ({ request }) => {
        token = request.headers.get(tokenHeader);
        return HttpResponse.json(makeSkillList());
      }),
    );

    expect(await api.skills()).toEqual(makeSkillList());
    expect(token).toBe('abc');
  });

  it('AC-5: adds a skill and returns the one the server wrote', async () => {
    let body: unknown;
    server.use(
      http.post(listUrl, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(makeSkill(), { status: 201 });
      }),
    );

    expect(await api.addSkill(fields)).toEqual(makeSkill());
    expect(body).toEqual(fields);
  });

  it('AC-6: saves a skill by its folder and returns it under the folder its Name makes', async () => {
    let sent: { folder: string; body: unknown } | undefined;
    server.use(
      http.put(skillUrl, async ({ params, request }) => {
        sent = { folder: String(params['folder']), body: await request.json() };
        return HttpResponse.json(makeSkill({ folder: 'bug-hunt', title: 'Bug hunt' }));
      }),
    );

    expect(await api.saveSkill('bug-bash', { ...fields, title: 'Bug hunt' })).toEqual(
      makeSkill({ folder: 'bug-hunt', title: 'Bug hunt' }),
    );
    expect(sent).toEqual({ folder: 'bug-bash', body: { ...fields, title: 'Bug hunt' } });
  });

  it('AC-7: rejects with skill_rejected and the words for Name', async () => {
    server.use(
      http.post(listUrl, () =>
        HttpResponse.json(
          { code: 'skill_rejected', message: 'You already have a skill in bug-bash.' },
          { status: 422 },
        ),
      ),
    );

    await expect(api.addSkill(fields)).rejects.toMatchObject({
      code: 'skill_rejected',
      message: 'You already have a skill in bug-bash.',
    });
  });

  it('AC-10: deletes a skill by its folder', async () => {
    let removed: string | undefined;
    server.use(
      http.delete(skillUrl, ({ params }) => {
        removed = String(params['folder']);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.removeSkill('bug-bash');

    expect(removed).toBe('bug-bash');
  });

  it('AC-13: adds the starter skills', async () => {
    let asked = false;
    server.use(
      http.post(`${baseURL}${apiRoutes.skillStarters}`, () => {
        asked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await api.addStarterSkills();

    expect(asked).toBe(true);
  });

  it('refuses a list that is not the contract', async () => {
    server.use(http.get(listUrl, () => HttpResponse.json({ skills: [{ folder: '../x' }] })));

    await expect(api.skills()).rejects.toBeInstanceOf(ApiRequestError);
  });

  it('AC-19: keys the list so skills.changed can refresh it, and keeps it until then', () => {
    const options = skillsQueryOptions(api);
    expect(options.queryKey).toEqual(queryKeys.skills);
    expect(options.staleTime).toBe(Infinity);
  });
});
