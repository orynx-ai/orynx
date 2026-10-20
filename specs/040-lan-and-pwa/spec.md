# Install Orynx, open it on your wifi at orynx.local, and keep it as an app

Status: approved
Roadmap: not on the roadmap. This is the user's ask from 20 Oct 2026: "make the UI a installable pwa add installable .sh script udpdate readme and landing page also make sure that after installation is done user can access it using orynx.local and https://orynx.local in any of the machine conntexted to same wifi". The branch is `feat/040-lan-and-pwa`, made from `origin/main` at PR #52.

## Assumptions

Correct these now, or the work goes ahead on them.

- **The hub stays on 127.0.0.1.** `apps/server` keeps listening on `127.0.0.1:4317` with its Host and session-token checks unchanged. With `DEVHUB_LAN=true` and `--serve-web`, it also opens a front door: HTTPS on port 443 and HTTP on port 80, on every address. The front door hands a request to the same Fastify instance (`app.routing`) only once the request has passed its own checks.
- **Devices on the wifi enter an access code once (Q1).** The front door lets a request through when it comes from this computer (loopback or one of its own addresses), or when it carries the `orynx_access` cookie holding the code. Any other GET gets a small "Enter the access code" page; the code is posted to `/orynx-access` and sets the cookie (HttpOnly, Secure, SameSite=Lax, one year). The code is 12 characters of Crockford base32 (60 bits), kept in `DEVHUB_HOME/lan-access-code` (0600), made on first start. Deleting the file and restarting gives a new code and signs every device out.
- **Only `orynx.local` is answered.** A request whose Host is not `orynx.local` gets 403, as the hub refuses names other than 127.0.0.1 and localhost, so a DNS-rebinding page can't read the page.
- **The name comes from the OS's own mDNS tool.** The server runs `/usr/bin/dns-sd -P` on macOS or `/usr/bin/avahi-publish -a` on Linux with the computer's wifi address, checks the address every 30 s, and announces again when it changes. No new dependency.
- **HTTPS uses a certificate authority made on this computer (Q2).** `./install.sh` makes it with `openssl` in `DEVHUB_HOME/tls` (CA for 10 years, the `orynx.local` certificate for 825 days, renewed by a run within 30 days of its end) and asks for sudo once to trust it on this computer. Other devices trust it once from `http://orynx.local/orynx-ca.crt`.
- **Plain http redirects to https (Q3)**, except for the certificate itself.
- **The app installs without a service worker (Q4).** `apps/web` gets a manifest, 192 and 512 px icons, an Apple touch icon and theme colours (`--bg-canvas`). Orynx can't work without its server, so there is nothing to cache for offline use.
- **`./install.sh` runs from a clone (Q5).** The repository is private, so there is no `curl | sh`. It installs Node 24 through nvm when nvm is there, builds the server and web app, makes the certificate, and starts Orynx at log-in: a LaunchAgent (`dev.orynx.server`) on macOS, a systemd user unit (`orynx`) on Linux. It waits for `https://orynx.local` and prints the addresses and the access code. Running it again updates Orynx.

## Goal

Install Orynx once with one script, and open it from any phone or computer on the same wifi at `orynx.local`, as an app you can keep on the dock or home screen, without opening it to anyone who merely shares the wifi.

## Acceptance criteria

| ID    | Given                                  | When                                                         | Then                                                                                                                    |
| ----- | -------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| AC-1  | the server's settings                  | `DEVHUB_LAN` is `true`, `false` or unset                     | the front door opens only for `true`; any other value is a settings error                                               |
| AC-2  | a computer with wifi, a VM bridge, VPN | Orynx picks the address to announce                          | it picks the wifi's (en*, eth*, wl*) IPv4 address                                                                       |
| AC-3  | no `lan-access-code` file              | the front door starts                                        | it makes a 12-character code in a 0600 file and keeps it on the next start                                              |
| AC-4  | a device on the wifi without the code  | it opens any page or calls `/api`                            | it gets the access code page or 401, never the page or its session token                                                |
| AC-5  | that device                            | it posts the right code, in any case, with or without dashes | it gets the cookie and is sent to `/`, which now loads Orynx                                                            |
| AC-6  | that device                            | it posts a wrong code, or sends a made-up cookie             | the page says the code doesn't match, sets no cookie, and nothing reaches the hub                                       |
| AC-7  | this computer                          | it opens `https://orynx.local`                               | Orynx loads without a code                                                                                              |
| AC-8  | any request                            | its Host is not `orynx.local`                                | 403, even with the cookie                                                                                               |
| AC-9  | a browser installing the app           | it fetches the manifest and icons without cookies            | they load; a look-alike path such as `//x/manifest.webmanifest` gets the code page                                      |
| AC-10 | `http://orynx.local`                   | a device opens `/orynx-ca.crt`, or any other path            | it gets the certificate, or a redirect to the same path on https                                                        |
| AC-11 | a fresh clone on macOS                 | the user runs `./install.sh`                                 | Orynx starts at log-in, `https://orynx.local` answers with a trusted certificate, and the script prints the access code |
| AC-12 | Orynx in Chrome                        | Chrome checks the page                                       | it reports no manifest or installability errors                                                                         |

## Out of scope

- A public `curl | sh` installer (the repository is private) and an uninstall command (README › Install lists the three steps).
- Offline use and push notifications through a service worker.
- More than one Orynx on one wifi: the second can't take `orynx.local`, and its log says so.
- Windows hosts, and announcing more than one address.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                                                                                    | Answer                                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Q1  | the user    | How is Orynx protected on the wifi? **Recommended:** an access code once per device. The other choice, no check, gives anyone on the same wifi (a café, an office) the session token, and with it Claude's commands and your tools' access. | Claude's call on the ask (20 Oct 2026); the user can overturn it.        |
| Q2  | the user    | How does https work for `.local`? **Recommended:** a CA made on this computer, trusted here by `./install.sh` and once on each other device. No public CA issues certificates for `.local`.                                                 | Claude's call on the ask (20 Oct 2026); the only way that works offline. |
| Q3  | the user    | Does `http://orynx.local` serve Orynx? **Recommended:** no, it redirects to https, so the access code and session token never cross the wifi in plain text.                                                                                 | Claude's call on the ask (20 Oct 2026); the user can overturn it.        |
| Q4  | the user    | A service worker for offline use? **Recommended:** none; Orynx needs its server, and Chrome, Edge and Safari install a page without one.                                                                                                    | Claude's call on the ask (20 Oct 2026); the user can overturn it.        |
| Q5  | the user    | Where does `./install.sh` install from? **Recommended:** the clone it sits in, so updating is `git pull && ./install.sh`.                                                                                                                   | Claude's call on the ask (20 Oct 2026); the user can overturn it.        |

## Design

none — the one new screen is the access code page, served by the front door before the app loads, in system colours. It follows the clean-ui copy rules.
