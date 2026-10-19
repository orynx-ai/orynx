import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for this repo's GitHub Releases, which the desktop app reads through DEVHUB_UPDATES_URL. It
 * answers 404, as a private repo does, until a test gives it a newer version.
 */
export class FakeReleases {
  readonly requests: { url: string; headers: IncomingHttpHeaders }[] = [];
  private newer: string | null = null;
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

  /** From now on, latest-mac.yml names this version, after a short wait so a test can stub the dialog first. */
  offer(version: string): void {
    this.newer = version;
  }

  close(): Promise<void> {
    return new Promise((done) =>
      this.server.close(() => {
        done();
      }),
    );
  }

  private answer(request: IncomingMessage, response: ServerResponse): void {
    this.requests.push({ url: request.url ?? '', headers: request.headers });
    const version = this.newer;
    // electron-updater asks for latest-mac.yml?noCache=…
    if (version === null || new URL(request.url ?? '/', this.url).pathname !== '/latest-mac.yml') {
      response.writeHead(404).end();
      return;
    }
    const zip = `Orynx-${version}-arm64-mac.zip`;
    const sha512 = 'A'.repeat(86) + '==';
    const yml = `version: ${version}\nfiles:\n  - url: ${zip}\n    sha512: ${sha512}\n    size: 1\npath: ${zip}\nsha512: ${sha512}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`;
    setTimeout(() => response.writeHead(200, { 'content-type': 'text/yaml' }).end(yml), 2000);
  }
}
