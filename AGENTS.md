# Agent handoff

Read this and `README.md` before changing anything. More than one agent works in this repo.

## Rules

- Run `git fetch` and check open pull requests and branches first.
- Work on your own branch and open a pull request. Do not push to `main` or to another agent's branch.
- This repository is public. Never commit secrets, service account files, `.env.production`, real franchisee names or emails, real site data, or a personal commit email.
- Do not deploy, create a Firebase project, or change DNS or hosting without the owner's OK.
- Update the status below when your work changes it.

## Status as of 2026-11-27

- `main`: phase 1 portal (#1) plus these notes (#3). `npm test` 8/8, `npm run build` and `npm run build:demo` pass.
- Rules tests and PHP tests have not been run (no Java or PHP on the machine used).
- #2 (admin address edit): open, not merged. #4 targets #2's branch and fixes a problem in it (see item 1).
- **Hosting is live.** `https://franchise.tropicaljuicebar.com` serves `/public_html/franchise` on Hostinger, with a certificate valid to 2027-02-25. Nothing is uploaded there yet, so it serves an empty directory.
- **Firebase project `tjb-franchise-portal` exists** (Spark, no billing, Analytics and Gemini off, parent org `tropicaljuicebar.com`). Email/Password sign-in is **on**.
- **Firestore is not created yet.** The console's location picker would not load its options, and the Cloud console asks for the owner's passkey. Someone with console access has to create the `(default)` database, Standard edition, in a US region, before rules or indexes can be deployed.
- Still to do after that: TOTP/Identity Platform upgrade, register the web app and fill `.env.production`, deploy rules and indexes, bootstrap the first admin, upload `dist/` and `api/`.

## Open items, in order

1. **Fix before merging #2.** Rejecting a location copies its address into `rejections`. Editing the address afterwards does not update that record, so the corrected address gets no "Same address" warning (and no ZIP warning if the ZIP changed), while the old typo still does. Reproduced with the demo store. Either block address edits on rejected locations (UI, rule, and demo store) or update the matching rejection records in the same write. Add a test.
2. Smaller points on #2:
   - The README "Gaps" section still says admins cannot edit an address.
   - `lat`/`lng` are not cleared or editable, so the Map link can keep pointing at the old place.
   - Opening the address dialog does not clear an earlier error message.
   - Address edits leave no history entry.
3. Run `npm run test:rules` (Java 21) and `npm run test:php` (PHP 8.2+).
4. Review `firestore.rules` before any real data goes in (see README, "Security rules").
5. Go live with the "Owner setup" steps in the README: Firebase first, then Hostinger.

## Commands

```bash
npm ci
npm test
npm run build
npm run build:demo
```
