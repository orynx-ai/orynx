# Set up Orynx the first time: your profile and a password for the wifi

Status: approved
Roadmap: not on the roadmap. This is the user's ask from 20 Oct 2026: "there is intall script ready https://github.com/orynx-ai/orynx this is the public repo that I am using update readme accordingly also add a stepup page which appears when user first time stepup the project which will ask username bio profile and a password so that no other person on name network access without password". The branch is `feat/043-first-run-setup`, made from `origin/main` at PR #54.

## Assumptions

Correct these now, or the work goes ahead on them.

- **The password replaces the access code (Q1).** Spec 040's front door at `https://orynx.local` asks for the password the person chose at setup instead of the code in `lan-access-code`. That file, its page and its wording go. A right password sets the `orynx_access` cookie (HttpOnly, Secure, SameSite=Lax, one year); the cookie holds an HMAC of the saved password hash, never the password, so a new password signs every device out.
- **This computer needs no password (Q1).** `http://127.0.0.1:4317`, `pnpm dev` and `https://orynx.local` opened on this computer load Orynx as today. The password guards the wifi only.
- **Setup happens on this computer only (Q2).** Until a password is saved, the front door shows other devices "Finish setting up Orynx" and lets nothing through, so nobody on the wifi can choose the password first. `POST /api/setup` refuses with 409 once a password is saved.
- **The password is saved as a scrypt hash (Q3)** in `DEVHUB_HOME/password` (0600), with Node's own `crypto.scrypt` and a random 16-byte salt. No new dependency. At least 8 characters and at most 128, typed twice.
- **The profile moves to the server (Q4).** Name, bio and picture live in `settings.json` under `profile`, behind `GET` and `PUT /api/profile`, so a phone shows the same person as the laptop. Edit profile saves there too, and loses its "Saved in this browser only." line. The profile that spec's browser kept (`devhub.profile` in localStorage) fills the setup form once and is then removed.
- **Name is required at setup (Q5)**, filled in with the name the server knows (`git config user.name`) when the browser kept none. Bio and picture are optional, as in Edit profile (80 and 160 characters; the picture a 256 px `data:image/…` URL).
- **A forgotten password (Q6):** delete `~/.devhub/password` and restart Orynx. The setup page opens again on this computer, filled in with the saved profile. No Change password in this spec.
- **Guessing is slowed (Q7).** After 10 wrong passwords within 15 minutes, the front door answers every try, right or wrong, with "Too many wrong passwords" until the oldest of them is 15 minutes old. One count for every device, so changing address doesn't buy more tries.
- **The README installs from `orynx-ai/orynx` (Q8):** `git clone https://github.com/orynx-ai/orynx.git && cd orynx && ./install.sh`, and `git pull && ./install.sh` to update. No `curl | sh`: `install.sh` builds the clone it sits in. `./install.sh` ends by saying where to set up Orynx when no password is saved yet.

## Goal

The first time I open Orynx it asks who I am and for a password, then opens. My phone and other computers on the wifi ask for that password at `orynx.local`, so nobody else on the same network can open Orynx, and they show the same name, bio and picture.

## Acceptance criteria

| ID    | Given                                   | When                                                                         | Then                                                                                                                           |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| AC-1  | an Orynx with no password saved         | this computer opens any page                                                 | "Set up Orynx" shows in place of the app, with Name filled in from the old browser profile or the server's name                |
| AC-2  | the setup form                          | the person sends it with no name, a short password or two that differ        | each field says what's wrong, focus moves to the first, and nothing is saved                                                   |
| AC-3  | the setup form, filled in               | the person chooses Finish setup                                              | the profile and the password's hash are saved, the old browser profile is removed, and Home opens with the name in the sidebar |
| AC-4  | an Orynx that is set up                 | anything posts to `/api/setup`                                               | 409 `already_set_up`, and the password and profile stay as they were                                                           |
| AC-5  | the saved password file                 | it is read                                                                   | it holds a salt and a scrypt hash, never the password, and only its owner can read it (0600)                                   |
| AC-6  | an Orynx that is set up                 | the person saves Edit profile                                                | the profile is saved on the server, and any other browser shows it after a reload                                              |
| AC-7  | a device on the wifi, no password saved | it opens any page or calls `/api`                                            | it gets "Finish setting up Orynx" or 401, and nothing reaches the hub                                                          |
| AC-8  | a device on the wifi, Orynx set up      | it opens any page                                                            | it gets "Enter your password", never the app or its session token                                                              |
| AC-9  | that device                             | it posts the right password                                                  | it gets the cookie and is sent to `/`, which now loads Orynx                                                                   |
| AC-10 | that device                             | it posts a wrong password, or sends a made-up cookie                         | the page says the password doesn't match, sets no cookie, and nothing reaches the hub                                          |
| AC-11 | 10 wrong passwords in 15 minutes        | any device posts again, even the right password                              | 429 "Too many wrong passwords", no cookie, until the oldest wrong try is 15 minutes old                                        |
| AC-12 | a device signed in on the wifi          | the password file is deleted and Orynx restarted, or a new password is saved | its cookie stops working                                                                                                       |
| AC-13 | the setup page                          | it is used with the keyboard, at 360 and 1280 px, in light and dark          | every field and button is reached in order, errors are announced, nothing runs off the screen, nothing moves while it loads    |
| AC-14 | the README                              | someone follows Install                                                      | they clone `orynx-ai/orynx`, run `./install.sh`, and set up Orynx on this computer before using it on the wifi                 |

## Out of scope

- A password on this computer, user accounts or more than one person per Orynx.
- Change password in Settings, and resetting it from another device.
- An end-to-end run of the setup page and the password page: the server's tests cover the front door and the app's tests cover the page. Every e2e hub starts set up.
- `curl | sh`, and publishing the mirror: the user pushes `orynx-ai/orynx` themselves.

## Open questions

The work is not done until every question has an answer. Write the date with each answer.

| #   | Who decides | Question                                                                                                                                                                                          | Answer                                                                                    |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Q1  | the user    | What does the password guard? **Recommended:** the wifi front door only, in place of the access code. This computer is yours already, and a password there would ask on every visit to 127.0.0.1. | Recommended answer accepted (20 Oct 2026: "after spec start planning and building also"). |
| Q2  | the user    | Who may set it up? **Recommended:** this computer only. Otherwise the first stranger on the wifi to open orynx.local chooses the password.                                                        | Recommended answer accepted (20 Oct 2026).                                                |
| Q3  | the user    | How is the password kept? **Recommended:** a scrypt hash with its salt in a 0600 file, at least 8 characters. The keychain would ask macOS on every wifi sign-in.                                 | Recommended answer accepted (20 Oct 2026).                                                |
| Q4  | the user    | Where does the profile live? **Recommended:** on the server, so every device shows the same person; the browser's copy fills setup once.                                                          | Recommended answer accepted (20 Oct 2026).                                                |
| Q5  | the user    | Is the name required? **Recommended:** yes at setup, filled in for you; Edit profile can still leave it empty to use the git name.                                                                | Recommended answer accepted (20 Oct 2026).                                                |
| Q6  | the user    | How do you reset a forgotten password? **Recommended:** delete `~/.devhub/password` and restart; setup opens again with your profile.                                                             | Recommended answer accepted (20 Oct 2026).                                                |
| Q7  | the user    | How are guesses slowed? **Recommended:** 10 wrong tries in 15 minutes, counted for all devices together.                                                                                          | Recommended answer accepted (20 Oct 2026).                                                |
| Q8  | the user    | How does the README install? **Recommended:** clone `orynx-ai/orynx` and run `./install.sh`; no `curl                                                                                             | sh`, since the script builds its own clone.                                               | Recommended answer accepted (20 Oct 2026). |

Wording (Claude's, the user can change it): the page is "Set up Orynx" with "Tell Orynx who you are and choose a password. Your phone and other computers on your wifi ask for it at orynx.local." and the button "Finish setup". Errors: "Enter your name.", "Use at least 8 characters.", "Keep the password to 128 characters.", "The passwords don't match.". The front door says "Enter your password" / "The one you chose when you set up Orynx." / "That password doesn’t match. Try again." / "Too many wrong passwords. Try again in 15 minutes.", and before setup "Finish setting up Orynx" / "Open Orynx on the computer that runs it and choose a password. Then come back here."

## Design

none — `docs/design/screens/` has no first-run screen. The page is Edit profile's fields (picture, Name, Bio) and two password fields in one centred column on the canvas, built from `@devhub/ui` and the clean-ui rules. The front door's pages keep spec 040's system-colour page.
