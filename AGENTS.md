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
notes, history, rejections and roles move to SQLite on the VPS that already runs
`platia`, behind the Traefik there. The screens and the Firebase sign-in do not
change. `docs/adr-001-backend-on-the-vps.md` has the reasoning and the plan.

Nothing has been built against this yet. The code on `main` is still the
Firestore version.

## Status as of 2026-11-27

- `main`: phase 1 portal (#1), these notes (#3), this decision. `npm test` 8/8, `npm run build` and `npm run build:demo` pass.
- Rules tests and PHP tests have never been run here (no Java or PHP on the machine used). Under the new plan they are replaced rather than fixed.
- #2 (admin address edit): open, not merged. #4 targets #2's branch and fixes a problem in it (see item 1). Both are worth merging: the behaviour carries over, only the storage changes.
- **Hosting:** `https://franchise.tropicaljuicebar.com` is live on Hostinger shared hosting with a certificate to 2027-02-25, serving an empty directory. Under the new plan this subdomain is repointed at the VPS and the shared-hosting one is removed.
- **Firebase project `tjb-franchise-portal` exists** (Spark, no billing, Analytics and Gemini off, parent org `tropicaljuicebar.com`). Email/Password sign-in is **on**. This is kept.
- **Firestore was never created**, and under this decision it will not be.

## Open items, in order

1. **Fix before merging #2.** Rejecting a location copies its address into `rejections`. Editing the address afterwards does not update that record, so the corrected address gets no "Same address" warning (and no ZIP warning if the ZIP changed), while the old typo still does. Reproduced with the demo store. #4 fixes it by freezing a rejected row's address. Review and merge #4 into #2, then #2 into `main`.
2. Smaller points on #2:
   - `lat`/`lng` are not cleared or editable, so the Map link can keep pointing at the old place.
   - Address edits leave no history entry.
3. Build the server described in the decision doc: token check, SQLite schema, the routes behind `src/lib/api.ts`, `src/lib/httpApi.ts`, polling in `src/data/watch.ts`, the intake route, and the permission tests ported from `tests/rules/`.
4. Deploy: container and Traefik route on the VPS, repoint DNS, nightly backup.
5. Confirm the authenticator-app claim on a real token before requiring it.

## Commands

```bash
npm ci
npm test
npm run build
npm run build:demo
```
