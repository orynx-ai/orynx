import { describe, expect, it } from 'vitest';
import { apiRoutes, PortActionAnswerSchema, SessionPortParamsSchema, SessionPortsSchema } from './index.ts';

const port = {
  port: 3005,
  pid: 59220,
  program: 'node',
  command: 'node ./node_modules/next/dist/bin/next dev --experimental-https --port 3005',
  name: null,
  url: 'https://localhost:3005',
  startedBy: 'claude',
  since: '2026-10-20T10:17:00.000Z',
  restartable: true,
} as const;

describe('ports (spec 042)', () => {
  it('AC-2, AC-10, AC-11: holds a web server with its address, and a database with a name and no address', () => {
    const ports = { ports: [port, { ...port, port: 5432, program: 'postgres', name: 'PostgreSQL', url: null }] };
    expect(SessionPortsSchema.parse(ports)).toEqual(ports);
  });

  it('AC-7: opens only localhost over http or https', () => {
    for (const url of ['https://example.com:3005', 'file:///etc/passwd', 'javascript:alert(1)'])
      expect(SessionPortsSchema.safeParse({ ports: [{ ...port, url }] }).success, url).toBe(false);
    expect(SessionPortsSchema.safeParse({ ports: [{ ...port, url: 'http://localhost:3000/' }] }).success).toBe(true);
  });

  it('AC-4, AC-5, AC-7: a stop or restart names a port in range, and says what happened', () => {
    expect(SessionPortParamsSchema.parse({ id: '372a80e3b0347420', port: '3005' }).port).toBe(3005);
    for (const bad of ['0', '65536', 'x', '30.5'])
      expect(SessionPortParamsSchema.safeParse({ id: '372a80e3b0347420', port: bad }).success, bad).toBe(false);
    expect(PortActionAnswerSchema.parse({ result: 'gone' })).toEqual({ result: 'gone' });
    expect(apiRoutes.sessionPorts).toBe('/api/sessions/:id/ports');
    expect(apiRoutes.sessionPortStop).toBe('/api/sessions/:id/ports/:port/stop');
    expect(apiRoutes.sessionPortRestart).toBe('/api/sessions/:id/ports/:port/restart');
  });
});
