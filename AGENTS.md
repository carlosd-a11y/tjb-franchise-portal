# Agent handoff

Read this and `README.md` before changing anything. More than one agent works in this repo.

## Rules

- **Never affect the company website.** `tropicaljuicebar.com` and `www` are the
  live WordPress site on Hostinger shared hosting at `82.25.87.9`, and the
  `MX` records are the company's Google Workspace email. Nothing in this project
  touches any of them. The portal runs on a different machine entirely. The one
  record this project changes is the `A` record whose host is `franchise`.
  **Note that `franchise` currently points at the same address as the website**,
  so in a DNS list the two rows look alike: match on the host name, never on the
  address. Do not delete anything in Hostinger shared hosting.
- Run `git fetch` and check open pull requests and branches first.
- Work on your own branch and open a pull request. Do not push to `main` or to another agent's branch.
- This repository is public. Never commit secrets, service account files, `.env.production`, real franchisee names or emails, real site data, or a personal commit email.
- Do not deploy, create a Firebase project, or change DNS or hosting without the owner's OK.
- Update the status below when your work changes it.
- Invitations send real email. `docs/invites.md` explains why it is plain SMTP
  through Workspace and not a mail service: **no DNS record may change**, since
  those records carry the company's email.
- **Do not build anything new on Firestore.** See `docs/adr-001-backend-on-the-vps.md`.

## Direction change, 2026-11-27

Carlos decided to **keep the Firebase login and drop Firestore**. Locations,
notes, history, rejections and roles live in SQLite on the VPS that already runs
`platia`, behind the Traefik there. The screens and the Firebase sign-in do not
change. `docs/adr-001-backend-on-the-vps.md` has the reasoning.

`VITE_BACKEND=server` switches the client to it. Without that flag the app still
talks to Firestore, so nothing has changed for anyone until the flag is set and
the container is deployed.

## Status as of 2026-11-28

- **Live.** `https://franchise.tropicaljuicebar.com` serves the portal from the
  VPS at `2.24.76.133` (`/opt/portal`, container `franchise-portal`, behind the
  Traefik that already serves platia). A nightly backup runs from
  `/etc/cron.d/portal-backup`. Update it with
  `cd /opt/portal && git pull && docker compose build && docker compose up -d`.
  The container publishes no ports: check it through Traefik
  (`curl -H 'Host: franchise.tropicaljuicebar.com' localhost/healthz`) or over
  HTTPS, never `localhost:5005`.
- `main` holds, beyond the server and scouts: listing link and contacts (#13),
  the admin-written Site criteria page (#14), TJB branding (#15) and
  invitations by email (#16).
- Tests: `npm test` 10/10, `cd server && ./.venv/bin/python -m pytest` 135/135.
  `npm run build` and `npm run build:demo` both pass.
- **Firebase project `tjb-franchise-portal`** (Spark, no billing) still does
  sign-in and holds passwords. Firestore was never created and will not be.
- `PORTAL_REQUIRE_TOTP` is still `false`.

## Open items, in order

1. Set the SMTP app password in `/opt/portal/.env` so invitations send
   themselves. See `docs/invites.md`. Until then an admin copies the link.
2. Confirm the authenticator-app claim on a real token, then set
   `PORTAL_REQUIRE_TOTP=true`. Do it only once everyone has enrolled.
3. Delete the Firestore code once the server has run for a week:
   `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`,
   `src/lib/firebaseApi.ts`, `src/data/firebaseWatch.ts`, `api/`, `tests/rules/`,
   `tests/intake.test.php`, and the cast in `src/lib/api.ts`.
4. Smaller, from the #2 review: an address edit does not clear `lat`/`lng`, so
   the Map link can point at the old place, and it leaves no history entry.
5. Not built, and worth asking Carlos about before starting: a way to paste a
   batch of finds in by hand, and a filter on the list by which platform found a
   site. The per-platform rate limit is 60 an hour, which is low for a bulk run.

## Commands

```bash
npm ci
npm test              # 10 client tests
npm run build
npm run build:demo

cd server
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt pytest
./.venv/bin/python -m pytest   # 135 server tests
```
