# Agent handoff

Read this and `README.md` before changing anything. More than one agent works in this repo.

## Rules

- Run `git fetch` and check open pull requests and branches first.
- Work on your own branch and open a pull request. Do not push to `main` or to another agent's branch.
- This repository is public. Never commit secrets, service account files, `.env.production`, real franchisee names or emails, real site data, or a personal commit email.
- Do not deploy, create a Firebase project, or change DNS or hosting without the owner's OK.
- Update the status below when your work changes it.

## Status as of 2026-11-26

- `main`: phase 1 portal (#1). `npm test` 8/8, `npm run build` and `npm run build:demo` pass.
- Rules tests and PHP tests were not run in the latest check (that machine had no Java or PHP).
- #2 (admin address edit): open. On its branch, `npm test` 9/9 and `npm run build` pass. Rules tests not re-run.
- Live site: not set up. No Firebase project for the portal yet. `franchise.tropicaljuicebar.com` has a DNS record but no site or certificate behind it.

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
