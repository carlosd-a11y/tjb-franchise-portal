# ADR-001: Keep the Firebase login, move the data to the VPS

**Status:** Accepted, 2026-11-27. Decided by Carlos.
**Supersedes:** the Firestore half of the original design in `README.md`.

## Decision

Firebase Authentication stays. Firestore goes. Locations, notes, history,
rejections and roles move to SQLite on the Hostinger VPS that already runs
`platia.tropicaljuicebar.com`, behind the Traefik instance already there.

The React app is unchanged apart from its data layer.

## Why now

No production data exists yet. Firestore was never created, so nothing has to
be migrated. The same move in three months would mean exporting live franchise
data. This is the cheapest it will ever be.

Three things drove it:

1. **One system to maintain.** Two hosting targets, two deployment steps and a
   rules language nobody here reviews is more surface than this app needs.
2. **Backups.** Firestore on Spark has none. A bad write or a bad rule would
   erase location history with no restore. The VPS already runs a nightly job
   and a SQLite file is one copy.
3. **The rules are the risk.** `firestore.rules` is 460 lines, is marked a
   prototype in `README.md`, has never been reviewed, and its tests have never
   been run here (they need Java). The same checks in Python are readable by
   the owner and testable with the rest of the suite.

Firebase Auth is kept because hand-building a login is the one thing this
project should not do. It also keeps the authenticator-app flow already built.

## What stays

- Every screen and route. `src/pages/`, `src/components/`, `src/styles.css`.
- `LoginPage`, `MfaPage`, `LiveAuth`, `AuthProvider`. The browser still talks to
  Firebase to sign in and to enroll an authenticator app.
- `src/lib/normalize.ts` and `tests/fixtures/address-vectors.json`. The address
  key does not change.
- The demo build. `npm run build:demo` keeps working and keeps its own store.

## What makes this cheap

`src/lib/api.ts` is already a switch between two complete implementations of
one interface: `src/lib/firebaseApi.ts` and `src/demo/database.ts`. The demo
store holds every rule in plain code and is the reference for the server.

Adding `src/lib/httpApi.ts` as a third implementation is the shape the code was
already written for. Nothing above `api.ts` needs to know.

## How the server trusts the browser

Firebase hands the browser a signed ID token. The client sends it as
`Authorization: Bearer <token>`. The server verifies, per request:

- the signature, against Google's published public keys, cached and refreshed
  on rotation;
- `iss` is `https://securetoken.google.com/<project-id>`;
- `aud` is the project id;
- `exp` is in the future.

PyJWT with `cryptography` is enough and is about forty lines. `firebase-admin`
is the alternative if revocation checks are wanted later.

The token's `sub` is the Firebase uid. A local `users` row keyed on that uid
carries `role` and `active`, exactly as the Firestore `users` document did. No
password ever reaches this server.

**This closes a gap the old design could not.** Firestore rules could not
require that the user had passed two-factor. The server can: when
`VITE_REQUIRE_TOTP` is on, reject a token whose `firebase.sign_in_second_factor`
claim is absent. Confirm the claim on a real token before turning it on.

## Data

One SQLite file, WAL on, busy timeout set, the same way `platia` does it. Tables
follow the collections in `README.md` with no change of meaning:

`users`, `invites`, `locations`, `notes`, `history`, `rejections`.

`locations.normalizedAddress` keeps its unique index. `notes` and `history`
carry a `location_id` foreign key instead of being subcollections.

## Rules become code

Each `allow` line in `firestore.rules` becomes a check in the route that
performs it. The transitions and their conditions do not change:

- A claim is allowed from `pool`, or when an active claim has had no activity
  for more than 30 days. It runs in a `BEGIN IMMEDIATE` transaction that
  re-reads the row, so two franchisees cannot both win.
- Advance follows claimed to researching to touring to submitted, owner or admin.
- A pass requires a reason of 3 to 500 characters and returns the row to `pool`.
- Approve and reject are admin only. Reject writes a `rejections` row.
- A rejected location's address is frozen (see #4).
- Delete is admin only.

Port `tests/rules/firestore.rules.test.ts` case by case into Python permission
tests. `platia`'s `test_auth.py` is the model. They then run with `npm test`'s
Python counterpart in CI instead of needing an emulator and Java.

## Live updates

Firestore pushed changes. The replacement polls the list endpoint every twenty
seconds while the tab is visible, and refetches after any action. A franchisee
may see someone else's claim up to twenty seconds late. The claim itself is
still safe, because the transaction above decides it, not the screen.

`src/data/watch.ts` keeps its signature so the pages do not change.

## Bot intake

`api/intake.php` becomes a route on the same server, sharing the normalizer and
the rejection-warning logic with everything else. The per-bot keys, the 409 on a
repeated address, the rate limit and the log all carry over.

This removes the sharpest edge in the old design: a service account that
bypassed the security rules entirely, with a PHP allow-list as the only control.

## Deployment

Its own container, its own database file, its own Traefik route for
`franchise.tropicaljuicebar.com`. Copy the pattern from `platia`'s
`docker-compose.yml`: no published port, a healthcheck, `restart: unless-stopped`,
and the existing Let's Encrypt resolver.

**DNS has to move.** `franchise.tropicaljuicebar.com` currently points at
Hostinger shared hosting, where a subdomain and certificate were set up on
2026-11-27. It must point at the VPS instead, and Traefik will issue its own
certificate. The shared-hosting subdomain can then be removed. DNS is at GoDaddy
and is the owner's to change.

## What gets deleted

`firestore.rules`, `firestore.indexes.json`, `firebase.json`, `.firebaserc`,
`src/lib/firebaseApi.ts`, `src/data/firebaseWatch.ts`, `api/`,
`tests/rules/`, `tests/intake.test.php`, and the Firestore half of
`scripts/`. The `firebase` client package stays, for Auth only, and the bundle
loses roughly 450 KB.

## Cost

Unchanged at $0 a month. Firebase Auth with Identity Platform is free under
3,000 daily active users and the authenticator app sends no SMS. The VPS is
already paid for and already runs two services.

The one thing that would start a bill on either design is photographs of
locations, which this app does not have yet. VPS disk is the cheaper place for
them when it does.

## Open questions

- Turning on the authenticator app needs the Identity Platform upgrade. That may
  only be reachable in the Google Cloud console, which asks the owner for a
  passkey. Find out early.
- Nightly backup of the database file: reuse `platia`'s job or add a small one.

## Explicitly rejected

- **Folding this into `platia`.** Franchisees are outside people. They should not
  share an application, or a database, with food cost and invoices. Same server
  and same pattern, separate container and separate file.
- **Hand-building the login.** The reason Firebase Auth is kept.
- **Staying on Firestore.** Covered above: no backups on the free plan, an
  unreviewed rules prototype, and a second system to deploy and watch.
