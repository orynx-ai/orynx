<!-- learn-sources: packages/core/src/plugins/local-only.ts apps/server/src/runtime-file.ts apps/web/vite.config.ts packages/api-client/src/client.ts -->

# Local security: why only this tab can call the server

DevHub's server runs on the developer's laptop and holds that person's Jira, GitHub and Slack access. Any web page the developer visits can try to send requests to `http://127.0.0.1:4317`. Three checks make sure only DevHub's own page gets answers.

## 1. Listen on 127.0.0.1 only

`apps/server` binds `127.0.0.1`, never `0.0.0.0`, so other machines on the network cannot reach the port at all.

## 2. A session token in the page

That alone is not enough: a page on `evil.example` running in the developer's browser is _on_ the laptop, and the browser will happily send it to `127.0.0.1:4317`. So every `/api` request must carry a secret that other pages cannot know.

1. On **every start**, `apps/server/src/runtime-file.ts` makes a fresh random token and writes `{ port, token, pid }` to `<DEVHUB_HOME>/runtime.json` (default `~/.devhub/runtime.json`) with file mode `0600`, so only the developer's user can read it.
2. The page receives the token in `<meta name="devhub-token">`:
   - `pnpm start`: the server injects it into `index.html` when it serves the page.
   - `pnpm dev`: Vite serves the page, so a small plugin in `apps/web/vite.config.ts` reads `runtime.json` and injects the same tag. Vite proxies `/api` to the server. It finds `DEVHUB_HOME` and the server's port the way the server does (the shell, then the repo-root `.env`), so it always reads the running server's file. From `.env` it keeps only those settings, never a token.
3. `packages/api-client/src/client.ts` reads nothing from the page itself; the host passes the token to `createApiClient({ baseURL, token })`, and the axios instance sends it as `x-devhub-token` on every request (`status()`, `sessions()`, the Jira and GitHub connection calls, Settings' preferences and folders, and every endpoint added after them share that one instance, which waits up to 20 s, longer than the server's slowest check). When the server answers 401 (for example after it restarted with a new token), `onUnauthorized` lets the host reload the page to pick up the new one.
4. `EventSource` cannot set headers, so the event stream (`/api/events`) is the one route that accepts `?token=`.
5. `packages/core/src/plugins/local-only.ts` compares the token in constant time and answers 401 when it is missing or wrong.
6. It decides whether a request is an `/api` request from the path the router matches, not only the raw URL. The router decodes `GET /%61pi/sessions` to `/api/sessions`, so a check on the raw text alone would let that request skip the token. The hook needs the token if the raw path, the decoded path or the matched route is under `/api`, and `create-server.test.ts` sends four such encodings.

**Why per start?** A token that never changes would live forever in old tabs, logs and screenshots. A new token on every start means a leaked one stops working the next time DevHub restarts, and stopping the server is always a full reset.

**Why can't another page read the token?** The browser's same-origin policy stops `evil.example` from reading the HTML of `http://127.0.0.1:4317`, so it cannot see the meta tag. Which leads to the third check.

## 3. Check the Host header (DNS rebinding)

The same-origin policy compares _names_, not addresses. In a DNS-rebinding attack:

1. The developer opens `http://evil.example:4317`. The attacker's DNS first answers with the attacker's own server, which sends a page with a script.
2. The attacker then changes the DNS answer for `evil.example` to `127.0.0.1`.
3. The script fetches `http://evil.example:4317/`. The name is the same, so the browser treats it as same-origin, but the request now lands on **DevHub's** server, and the script could read the page and its token.

The browser still sends `Host: evil.example:4317`. So `local-only.ts` rejects (403) any request whose Host is not exactly `127.0.0.1:<port>` or `localhost:<port>`. The rebinding page never gets the HTML, so it never gets the token.

In dev, Vite's own `server.allowedHosts` check protects port 4318 the same way, and the proxy rewrites the Host it forwards to the server (`changeOrigin`).

## What this does not protect against

- Malware already running as the developer's user can read `runtime.json` and the keychain. That is outside DevHub's threat model.
- These checks are why there is no CORS configuration: no other origin is ever allowed to call the API.

## Where tokens for Jira, GitHub and Slack live

Not here. Those live in the OS keychain, are read only by `packages/core` (through `app.tokens`), and never reach the browser, a log line, an event or the inbox's `cache.db` (spec 007). The inbox routes (`/api/inbox`, its refresh and its cache) sit behind the same Host and session-token checks as every other `/api` route. See `learn/tokens-and-keychain.md`. The session token above only proves "this request came from DevHub's own page".
