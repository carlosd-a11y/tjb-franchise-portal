# Tropical Juice Bar — franchisee location portal

> **The backend moved.** Firebase still signs people in. The data lives in
> SQLite on the VPS, not in Firestore. See
> [docs/adr-001-backend-on-the-vps.md](docs/adr-001-backend-on-the-vps.md).
> The Firestore sections below are kept until that code is deleted, and the
> "Owner setup — Firebase" steps about Firestore rules and indexes no longer
> apply. Run the server with `VITE_BACKEND=server`.

## Running the server

```bash
cd server
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt pytest
./.venv/bin/python -m pytest        # 84 tests
cp .env.example .env                # fill in the Firebase project id
PORTAL_FIREBASE_PROJECT_ID=... ./.venv/bin/python app.py
```

`npm run build` first, so there is a `dist/` for it to serve. In production
`docker compose up -d --build` does both.

Phase 1 of the portal for `franchise.tropicaljuicebar.com`. It is a static Vite + React + TypeScript app. Firebase Auth and Firestore are the backend. A small PHP endpoint on Hostinger lets bots add pool locations without Cloud Functions.

Nothing in this repo deploys, creates a Firebase project, or changes DNS. Local development uses the Firebase Local Emulator Suite and a `demo-` project id, which cannot reach production.

## Monthly cost

**$0** if you stay inside the free quotas and do not turn on billed products.

| Piece | Plan | What to expect |
| --- | --- | --- |
| Hostinger shared hosting | Existing plan | $0 extra for a subdomain and PHP. No new plan. |
| Firestore | Spark | 1 GiB stored, 50K reads/day, 20K writes/day, 20K deletes/day. A small franchise list stays inside that. |
| Auth email/password | Spark | Included. |
| Identity Platform + TOTP | Spark | Required for authenticator-app MFA. After the upgrade, Spark is capped at **3,000 daily active users**. A handful of franchisees is far under that. TOTP does not send SMS. |
| SMS / phone MFA | Do not enable | Billed per message. |
| Cloud Functions / Blaze | Do not enable | This app does not use them. |

If Google later asks for a billing account, add a $1 budget alert and leave paid products off. Do not enable phone auth.

## Local demo

Requirements: Node 20+, Java 21 (the Firestore emulator), PHP 8.2+ (intake tests only).

```bash
npm install
npm run emulators
```

In a second terminal:

```bash
npm run seed
npm run dev
```

Open http://127.0.0.1:5173. The seed is fictional and refuses to run unless both emulator hosts are set and the project id starts with `demo-`.

| Who | Email | Password |
| --- | --- | --- |
| Franchisee | alex@tropicaljuice.test | DemoPassw0rd! |
| Admin | admin@tropicaljuice.test | DemoPassw0rd! |
| Other franchisee | jordan@tropicaljuice.test | DemoPassw0rd! |
| Inactive | sam@tropicaljuice.test | DemoPassw0rd! |

Emulator UI: http://127.0.0.1:4000. Auth emulator: port 9099. Firestore emulator: port 8080.

`VITE_REQUIRE_TOTP` is `false` in `.env.development` because the official Auth emulator cannot issue TOTP secrets ([firebase-tools #6224](https://github.com/firebase/firebase-tools/issues/6224)). Production `.env.example` sets it to `true`.

## Shareable demo build

`npm run build:demo` writes `dist-demo/`. It is a static site with no Firebase config and no calls to Google. Sample locations live in `localStorage` (Reset sample data puts the fictional seed back). A banner says "Demo, sample data only". Franchisee / Admin switches who you are acting as. The page is `noindex`, and `robots.txt` disallows every crawler. Do not commit `dist-demo/`.

## Tests

```bash
npm test            # normalize, claim window, filters, sample CSV
npm run test:rules  # Firestore emulator allow/deny cases
npm run test:php    # intake validation, dedupe, rate limit, logging
npm run build       # tsc + static dist/
```

Rules covered: inactive user, anonymous visitor, editing someone else's note, a franchisee rejecting, a double claim, a fresh claim versus a stale 40-day claim, passing without a reason, plus the matching allows (own note, admin reject, claim, pass, advance, activity refresh, delete).

## What the app does

- Email/password sign-in. No public sign-up.
- When `VITE_REQUIRE_TOTP` is not `false`, the first sign-in must enroll an authenticator app (Firebase TOTP MFA) before any data loads. Sign-in after that asks for the 6-digit code.
- Only an **active** `users/{uid}` document with role `admin` or `franchisee` can read locations, notes, history, or rejections.
- Every active user sees the shared location list. Filters: status, city, Mine, Pool.
- Franchisees add locations (they land in the pool) and notes. They can edit only their own notes.
- Claiming is a transaction. Rules allow it only when `status == pool`, or when a claimed / researching / touring / submitted row has had no activity for more than 30 days. The UI shows days left from `lastActivityAt`.
- The owner (or an admin) moves it forward: Claimed → Researching → Touring → Submitted. **Keep** refreshes the 30-day clock.
- **Pass** requires a reason, clears the claim, and returns the row to the pool. The reason is stored on the location (`passReason`) and in history.
- Admins approve a submitted row, or reject one and write a `rejections` record. Admins delete. Admins manage users and invites, and import historical rejections from CSV.
- Adding a location, opening one, or posting through intake shows an amber warning when the address or ZIP matches a rejection, including the reason. The warning does not block the save.

There is no background job. A stale claim stays on its old status until someone claims it. The rules treat that claim as open, and the list shows "Open to claim".

## Data model

`users/{uid}`: `uid`, `email`, `name`, `role` (`admin` | `franchisee`), `active`.

Readable by the person themselves and by admins. Franchisees do not get a directory of emails. Names are copied onto locations (`claimedByName`), notes, and history.

`invites/{email}`: `email`, `name`, `role`, `createdBy`, `createdAt`, `status` (`pending` | `provisioned`). Admin only. An invite does not grant access. The Auth user and the `users/{uid}` doc do.

`locations/{id}`: `address`, `city`, `state` (2 letters), `zip` (5 digits), `normalizedAddress`, `lat`, `lng` (both null or both numbers), `sqft`, `rent` (monthly dollars), `source` (`manual` or `bot:<name>`), `status`, `claimedBy`, `claimedByName`, `claimedAt`, `lastActivityAt`, `createdBy`, `createdAt`, `passReason`.

Status values: `pool`, `claimed`, `researching`, `touring`, `submitted`, `approved`, `rejected`. A pass does **not** leave the row in a `passed` status. It returns to `pool`. History records the pass, and `passReason` holds the text so rules can reject an empty pass without a Cloud Function.

`locations/{id}/notes`: `text`, `authorUid`, `authorName`, `createdAt`.

`locations/{id}/history`: `fromStatus`, `toStatus`, `actorUid`, `actorName`, `reason`, `createdAt`.

`rejections`: `address`, `city`, `state`, `zip`, `normalizedAddress`, `rejectedBy`, `rejectedAt`, `reasonCode`, `reasonText`.

`reasonCode`: `rent`, `traffic`, `competition`, `size`, `zoning`, `parking`, `visibility`, `landlord`, `demographics`, `other`.

`normalizedAddress` is `address|city|state|zip5`. The street line folds case, punctuation, `&`, unit and suite numbers, numeric and word ordinals (`1st` / `First`), directions (`N` / `North`, `NE` / `Northeast`), and these suffixes: St/Street, Ave/Avenue, Rd/Road, Blvd/Boulevard, Dr/Drive, Ln/Lane, Ct/Court, Pl/Place, Pkwy/Parkway, Hwy/Highway, Rte/Route, plus `US` / `U.S.`. A city `St.` is left as `st` so "St. Pete" is not treated as Street. The same function lives in `src/lib/normalize.ts` and `api/src/Intake.php`, checked against `tests/fixtures/address-vectors.json`. A different street in the same ZIP still raises the ZIP warning.

Client creates must use `source: manual` and `status: pool`. Bot rows are written only by the PHP endpoint, which uses a service account and bypasses rules. The endpoint itself only creates pool documents.

## Security rules

`firestore.rules` is the source of truth. Default deny.

- Creates of locations, users, notes, history, invites, and rejections run a full field validator (types, lengths, enums).
- Location updates are separate allow lines for claim, advance, pass, admin approve/reject, and activity refresh. Each line may change only the fields that action needs (`diff().affectedKeys()`). That keeps a franchisee from rewriting an address or escalating a status while they claim.
- A claim older than 30 days (`lastActivityAt + duration.value(30, 'd') < request.time`) is claimable again. Approved and rejected rows are not.
- Passing to `pool` from an owned status requires `passReason` of 3–500 characters. History of that move requires a reason too.
- Deletes are admin-only. An admin cannot deactivate or demote their own user doc.

These rules are a prototype. Review them before real franchisee data is stored. The rules engine has a per-request expression budget, so location **updates** rely on the field allow-list above instead of re-running the entire create validator. A bad seed document could therefore be claimed without every old field being rechecked. New client creates are fully checked.

Firestore rules cannot see `VITE_REQUIRE_TOTP`. Once every production user has enrolled, you can optionally require the TOTP sign-in claim in rules. Do not add that until you have confirmed the claim name on a real ID token, and do not add it while you still use the Auth emulator.

## Owner setup — Firebase

Do this in the Firebase console. This repository does not do it.

1. Create a Firebase project on the **Spark** plan. Pick a region close to the shops for the default Firestore database. Use **Standard** edition (rules + the web JS SDK), not Enterprise.
2. Authentication → Sign-in method → enable **Email/Password**.
3. Authentication → Settings → upgrade to **Firebase Authentication with Identity Platform**. Stay on Spark. Do not enable SMS.
4. Enable the **TOTP** multi-factor provider (not phone). One way is the Admin SDK `projectConfigManager().updateProjectConfig` with `totpProviderConfig` (adjacent intervals 5 is the default). The console path is Authentication → Settings → Multi-factor authentication → TOTP.
5. Register a web app. Copy the config into `.env.production` using `.env.example`. Set `VITE_USE_EMULATORS=false` and `VITE_REQUIRE_TOTP=true`.
6. Build: `npm run build`.
7. Deploy **only** rules and indexes, from your machine, when you are ready:

   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project YOUR_PROJECT_ID
   ```

   Do not deploy Hosting, Functions, or Auth config from this repo. The site is served by Hostinger.

8. Create the first admin. Firebase console → Authentication → Add user. Then, with a service account that can write Auth and Firestore (Cloud Datastore User is enough for the doc; the Auth Admin role is needed to create the user):

   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/firebase-sa.json
   export FIREBASE_PROJECT_ID=your-project-id
   export BOOTSTRAP_EMAIL=you@yourdomain.com
   export BOOTSTRAP_NAME="Your Name"
   read -s BOOTSTRAP_PASSWORD
   export BOOTSTRAP_PASSWORD
   export BOOTSTRAP_CONFIRM=yes
   npm run bootstrap-admin
   ```

   The script exits unless every one of those is set. It refuses emulator hosts and `demo-` project ids. It does nothing if an active admin already exists. It marks the email verified, which TOTP enrollment requires. It does not print the password.

9. Later users: Authentication → Add user, mark the email verified (or use the bootstrap pattern). In the portal, Admin → Users, paste the UID, email, name, and role. Invites are a checklist only.

## Owner setup — Hostinger

The subdomain document root should end up like this:

```
public_html/index.html
public_html/assets/...
public_html/.htaccess
public_html/api/intake.php
public_html/api/src/Intake.php
public_html/api/src/FirestoreRest.php
public_html/api/.htaccess
public_html/api/src/.htaccess
```

Upload the **contents** of `dist/` (so `index.html` is at the root) and the `api/` directory beside it. `dist/` does not contain `api/`.

Outside the web root, for example `/home/USER/private/` (mode `700`):

- `tj-intake-config.php` — copy from `api/config.example.php` and fill in
- `firebase-sa.json` — service account JSON. Never commit it. Never put it under `public_html`.
- The log, rate-limit, and token-cache paths from the config

In the Hostinger hPanel for the subdomain:

1. Point `franchise.tropicaljuicebar.com` at this document root. SSL on, force HTTPS. DNS is yours to change; this repo does not touch it.
2. Uncomment and edit the `SetEnv` line in `.htaccess`:

   ```
   SetEnv TJ_INTAKE_CONFIG /home/USER/private/tj-intake-config.php
   ```

The `.htaccess` sends unknown paths to `index.html` and leaves `/api/` alone. `api/.htaccess` allows only `intake.php`.

Generate a long random string per bot and map it to a short source name (`muse`, `scout`). The stored `source` becomes `bot:muse`. Keys live only in the private config. The endpoint accepts:

```bash
curl -sS https://franchise.tropicaljuicebar.com/api/intake.php \
  -H "Authorization: Bearer $INTAKE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"address":"100 Demo Harbor Dr","city":"Miami","state":"FL","zip":"33139","sqft":1450,"rent":8200}'
```

Optional `lat` and `lng`. Unknown fields are rejected. A repeated `normalizedAddress` returns HTTP 409 and does not write. A ZIP or address that matches `rejections` is still created, with `rejectionWarnings` in the JSON. Default limit is 60 requests per key per hour, plus a coarser per-IP limit. Logs go to the private log file and never include the API key or the service account.

The service account needs the Firestore write it performs (`datastore` scope). Prefer a dedicated key you can delete. PHP needs `curl` and `openssl`, which Hostinger provides. No Composer packages.

## CSV import

Admin → Import. Columns:

```
address,city,state,zip,rejectedBy,rejectedAt,reasonCode,reasonText
```

`samples/rejections-sample.csv` is 10 rows of obviously fake history, one for each reason code. Every note starts with `FAKE`. Importing it writes real rejection documents in whatever project you are signed into, so use it on the emulator or on an empty collection.

## Gaps

- The Auth emulator cannot complete TOTP. Enrollment is implemented for production Identity Platform and is covered by the config flag.
- Stale claims are not swept on a timer. They become claimable at the next claim.
- Address matching folds the suffix, direction, unit, and ordinal forms listed above. It is not a fuzzy geocoder: "Saint Paul" and "St Paul" still differ, and a missing street number will not match.
- An owner can append a history row for the current status without changing the location. Status changes themselves are enforced on the location document.
- Rules do not require MFA, for the emulator reason above.
- Invites do not send email and do not create Auth users.
- Admins cannot edit an address in place. Correct a typo by deleting the row (admin) and adding it again, or extend the rules later with a small admin-edit allow list.
- No App Check, no audit export, no map clustering.
- Client list reads up to 300 locations and filters in the browser. Add a composite index if that ever gets slow.
- The intake service account bypasses security rules. The PHP allow-list is the control. Rotate the key if it leaks.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite on 127.0.0.1:5173 |
| `npm run emulators` | Auth + Firestore emulators |
| `npm run seed` | Fictional emulator data only |
| `npm run build` | `dist/` for Apache |
| `npm run bootstrap-admin` | First real admin. Refuses to run without the guards above. |
