import { createHash } from 'node:crypto';
import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for this repo's GitHub Releases: the download folder the desktop app reads through DEVHUB_UPDATES_URL,
 * and the REST API's list its hub reads through DEVHUB_RELEASES_URL (spec 045). Until a test offers a newer version
 * it has no release: the list is empty and every file answers 404, as before the first release.
 */
export class FakeReleases {
  readonly requests: { url: string; headers: IncomingHttpHeaders }[] = [];
  private newer: { version: string; zip: Buffer } | null = null;
  private readonly server: Server;

  private constructor(server: Server) {
    this.server = server;
  }

  static async start(): Promise<FakeReleases> {
    const releases = new FakeReleases(
      createServer((request, response) => {
        releases.answer(request, response);
      }),
    );
    await new Promise<void>((done) => releases.server.listen(0, '127.0.0.1', done));
    return releases;
  }

  get url(): string {
    return `http://127.0.0.1:${String((this.server.address() as AddressInfo).port)}`;
  }

  /** GitHub's list of releases, as the hub asks for it. */
  get listUrl(): string {
    return `${this.url}/repos/orynx-ai/orynx/releases`;
  }

  /** From now on there is a release of this version, whose Mac zip holds these bytes. */
  offer(version: string, zip: Buffer = Buffer.from('not a real zip')): void {
    this.newer = { version, zip };
  }

  close(): Promise<void> {
    return new Promise((done) => {
      this.server.closeAllConnections();
      this.server.close(() => {
        done();
      });
    });
  }

  private answer(request: IncomingMessage, response: ServerResponse): void {
    this.requests.push({ url: request.url ?? '', headers: request.headers });
    const path = new URL(request.url ?? '/', this.url).pathname;
    const newer = this.newer;
    if (path === '/repos/orynx-ai/orynx/releases') {
      const list =
        newer === null
          ? []
          : [
              {
                tag_name: `v${newer.version}`,
                body: '## New\n\n- Update Orynx from Settings › About',
                draft: false,
                prerelease: false,
                published_at: '2026-10-22T10:00:00Z',
                html_url: `https://github.com/orynx-ai/orynx/releases/tag/v${newer.version}`,
              },
            ];
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(list));
      return;
    }
    const zip = newer === null ? null : `Orynx-${newer.version}-arm64-mac.zip`;
    // electron-updater asks for latest-*.yml?noCache=…; only the Mac's is ever offered.
    if (newer !== null && path === '/latest-mac.yml') {
      const sha512 = createHash('sha512').update(newer.zip).digest('base64');
      const yml = `version: ${newer.version}\nfiles:\n  - url: ${String(zip)}\n    sha512: ${sha512}\n    size: ${String(newer.zip.length)}\npath: ${String(zip)}\nsha512: ${sha512}\nreleaseDate: '2026-10-22T10:00:00.000Z'\n`;
      response.writeHead(200, { 'content-type': 'text/yaml' }).end(yml);
      return;
    }
    if (newer !== null && path === `/${String(zip)}`) {
      response.writeHead(200, { 'content-type': 'application/zip' }).end(newer.zip);
      return;
    }
    response.writeHead(404).end();
  }
}
