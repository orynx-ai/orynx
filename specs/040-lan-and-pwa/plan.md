# Plan: Install Orynx, open it on your wifi, keep it as an app

Spec: `specs/040-lan-and-pwa/spec.md`

## Order of work

1. **The app manifest and icons** in `apps/web`, checked with Chrome's own installability report (AC-12).
2. **`DEVHUB_LAN`** in `apps/server/src/config.ts` and `.env.example` (AC-1).
3. **The front door** in `apps/server/src/lan.ts`, tested through a real Fastify hub (AC-3–AC-10), and the announcer in `announce.ts` (AC-2). `main.ts` starts both after the hub listens and stops them first.
4. **`./install.sh`**, run end to end against a temporary `DEVHUB_HOME` for its certificate step and the server in LAN mode (AC-11).
5. **Docs:** README, the landing page, `learn/local-security.md`, `docs/architecture.md` and rule 10 in `CLAUDE.md` (then `pnpm agent-rules`).

## Risks

| Risk                                                                  | How we will notice early                      | What we do                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A path the front door lets through without the code reaches the page. | AC-9's look-alike path test.                  | Public files are matched on the raw path and served by the front door; nothing else passes. |
| Ports 80 or 443 are taken, or Linux keeps them for root.              | The server stops with "can't listen on port". | `./install.sh` sets `ip_unprivileged_port_start=80` on Linux; the log names the port.       |
| The wifi hands out a new address.                                     | `orynx.local` stops answering.                | The announcer checks every 30 s and announces again.                                        |
