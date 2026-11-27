# Agent handoff

Read this and `README.md` before changing anything. More than one agent works in this repo.

## Rules

- Run `git fetch` and check open pull requests and branches first.
- Work on your own branch and open a pull request. Do not push to `main` or to another agent's branch.
- This repository is public. Never commit secrets, service account files, `.env.production`, real franchisee names or emails, real site data, or a personal commit email.
- Do not deploy, create a Firebase project, or change DNS or hosting without the owner's OK.
- Update the status below when your work changes it.
- **Do not build anything new on Firestore.** See `docs/adr-001-backend-on-the-vps.md`.

## Direction change, 2026-11-27

Carlos decided to **keep the Firebase login and drop Firestore**. Locations,
notes, history, rejections and roles live in SQLite on the VPS that already runs
`platia`, behind the Traefik there. The screens and the Firebase sign-in do not
change. `docs/adr-001-backend-on-the-vps.md` has the reasoning.

`VITE_BACKEND=server` switches the client to it. Without that flag the app still
talks to Firestore, so nothing has changed for anyone until the flag is set and
the container is deployed.

## Status as of 2026-11-27

- `main` holds: phase 1 (#1), handoff notes (#3), the decision (#6), the admin
  address edit with its rejected-address fix (#2, #4), the server (#7), and
  scouts (#8).
- Tests: `npm test` 10/10, `cd server && ./.venv/bin/python -m pytest` 93/93.
  `npm run build` and `npm run build:demo` both pass.
- The server has been run under gunicorn and serves the built site, deep links
  and the API. **The browser has never talked to it**: that needs a real
  Firebase token, so it needs deploying.
- **Hosting:** `https://franchise.tropicaljuicebar.com` is live on Hostinger
  shared hosting with a certificate to 2027-02-25, serving an empty directory.
  It has to be repointed at the VPS.
- **Firebase project `tjb-franchise-portal`** exists (Spark, no billing,
  Analytics and Gemini off, parent org `tropicaljuicebar.com`). Email/Password
  sign-in is on. This is kept; Firestore was never created and will not be.

## Open items, in order

1. Deploy: `docker compose up -d --build` on the VPS, repoint DNS from shared
   hosting, build with `VITE_BACKEND=server`, install `server/backup.sh` nightly.
2. Register the real scouting platforms in Admin -> Scouts and give each its key.
   Nothing goes in a file any more.
3. Confirm the authenticator-app claim on a real token, then set
   `PORTAL_REQUIRE_TOTP=true`. Do it only once everyone has enrolled.
4. Delete the Firestore code once the server has run for a week:
   `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`,
   `src/lib/firebaseApi.ts`, `src/data/firebaseWatch.ts`, `api/`, `tests/rules/`,
   `tests/intake.test.php`, and the cast in `src/lib/api.ts`.
5. Smaller, from the #2 review: an address edit does not clear `lat`/`lng`, so
   the Map link can point at the old place, and it leaves no history entry.
6. Not built, and worth asking Carlos about before starting: a way to paste a
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
./.venv/bin/python -m pytest   # 93 server tests
```
