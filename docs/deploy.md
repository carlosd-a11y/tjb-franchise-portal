# Deploying the portal

First run, on the VPS that already serves `platia.tropicaljuicebar.com`, behind
the Traefik instance already there. About twenty minutes, plus DNS.

Steps 2, 3 and 6 need the owner: they involve a password, a config the browser
shows once, and a DNS record.

## Already done

- Firebase project `tjb-franchise-portal` exists on Spark, with Email/Password
  sign-in on and no billing attached.
- A web app named **Franchise portal** is registered in it.
- `franchise.tropicaljuicebar.com` is an **authorized domain** for sign-in, so
  the login will work from there.
- The subdomain resolves and has a certificate, but it still points at Hostinger
  shared hosting, which serves a "Coming soon" page.

## Before you start: take a snapshot

The VPS already runs platia and Hermes, and its backups are **weekly**, so a
restore point could be six days old. hPanel → VPS → Snapshots → take one. It is
one click and it is the only thing here that is hard to undo.

## The company website

`tropicaljuicebar.com` must not be affected by any of this, so:

| Record | Value | What it is |
| --- | --- | --- |
| `@` | `82.25.87.9` | The live WordPress site. **Do not touch.** |
| `www` | `tropicaljuicebar.com` | The same site. **Do not touch.** |
| `MX` | Google Workspace | Company email. **Do not touch.** |
| `platia` | `2.24.76.133` | The other service. **Do not touch.** |
| `franchise` | `82.25.87.9` → `2.24.76.133` | The only record this project changes. |

The website lives on Hostinger shared hosting at `82.25.87.9`. The portal lives
on the VPS at `2.24.76.133`. They are different machines: nothing done on the VPS
can reach the website. The only shared thing is the DNS zone, and only one record
in it.

**The trap:** `franchise` currently points at the same address as the website, so
in GoDaddy's list the two rows carry the same value. Match on the **host name**,
never on the address.

## What this cannot disturb

Its own container, its own database file, port 5005 (platia is on 5004), its own
Traefik router name, and its own Firebase project. No port is published, so it
adds nothing to the firewall. Traefik and the kernel are the only things shared.

The build is the one moment it competes for the box: `npm ci` and the Vite build
will use both cores for a few minutes. platia will feel slower while that runs.
It will not stop.

The real risk in this runbook is step 6, the DNS record, and it is not on the
VPS at all. Read "The company website" above before doing it.

## 1. Get the code onto the VPS

```bash
ssh <the VPS that runs platia>
sudo mkdir -p /opt/portal && sudo chown "$USER" /opt/portal
git clone https://github.com/carlosd-a11y/tjb-franchise-portal.git /opt/portal
cd /opt/portal && mkdir -p data
```

## 2. The browser config

Firebase console → Project settings → General → Your apps → **Franchise portal**
→ Config. Copy the six values into `/opt/portal/.env.production`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

VITE_USE_EMULATORS=false
VITE_BACKEND=server
VITE_REQUIRE_TOTP=false
```

`VITE_BACKEND=server` is what points the app at this server instead of Firestore.

`VITE_REQUIRE_TOTP` stays `false` for the first sign-in. Turn it on once everyone
has enrolled an authenticator app, or you will lock people out of an app nobody
can get into yet.

These are public client keys and ship inside the built JavaScript. They are not
secrets, but the file is git-ignored so nobody commits something that is.

## 3. The server config

`/opt/portal/.env`:

```
PORTAL_FIREBASE_PROJECT_ID=tjb-franchise-portal
PORTAL_REQUIRE_TOTP=false
```

Nothing else goes here. Scouting platforms are added in the portal itself, under
Admin → Scouts, which issues each key.

## 4. Start it

```bash
cd /opt/portal
docker compose up -d --build
docker compose logs --tail 30
curl -s localhost:5005/healthz        # {"ok":true}
```

The build runs `npm ci` and `npm run build` inside the image, so the VPS needs no
Node of its own. First build takes a few minutes.

**If Traefik does not pick it up**, compare `docker-compose.yml` with platia's.
Traefik there runs on the host network with the `letsencrypt` resolver, and this
file copies that pattern, but platia may attach a network this one does not.
`docker compose logs` on Traefik will say.

## 5. Check it before moving DNS

From the VPS:

```bash
curl -s -H 'Host: franchise.tropicaljuicebar.com' localhost/healthz
```

## 6. Point the domain at it

Check the website is fine first, so you know its state before and after:

```bash
./server/check_site.sh
```

At GoDaddy, change **only** the A record whose host is `franchise`, from the
shared-hosting address to the VPS address `2.24.76.133`.

Leave every other record alone. The `@` record is the main website and `platia`
is the other service; editing either by mistake takes a live site down. If the
list shows several records, match on the host name `franchise`, not on the
address. Then wait for it to spread, and watch Traefik get a certificate:

```bash
./server/check_site.sh
dig +short franchise.tropicaljuicebar.com
curl -sI https://franchise.tropicaljuicebar.com/healthz
```

If `check_site.sh` reports anything moved, put that record back before going on.

**Leave the Hostinger subdomain alone.** Once DNS points at the VPS nothing
reaches it, so it costs nothing to keep, and deleting the wrong entry in hPanel
is one of the few ways to take the company website down. Not worth the tidiness.

## 7. Make the first admin

Firebase console → Authentication → Users → **Add user**. Use the owner's email,
set a password, and mark the email verified. Copy the UID it creates.

Then on the VPS:

```bash
cd /opt/portal
docker compose exec portal sh -c '
  cd server &&
  BOOTSTRAP_UID=<the uid> \
  BOOTSTRAP_EMAIL=<the email> \
  BOOTSTRAP_NAME="Carlos Lopez" \
  BOOTSTRAP_CONFIRM=yes \
  python3 bootstrap_admin.py'
```

It refuses unless all four are set, and does nothing if an active admin already
exists. It never touches passwords: Firebase holds those.

Sign in at `https://franchise.tropicaljuicebar.com`. Everyone else is added from
Admin → Users, pasting the UID that Firebase shows for them.

## 8. Nightly backup

```bash
sudo tee /etc/cron.d/portal-backup <<'CRON'
0 3 * * * root docker compose -f /opt/portal/docker-compose.yml exec -T portal /app/server/backup.sh
CRON
```

The database is one file in `/opt/portal/data`. Copying it is the whole backup.

## Updating later

```bash
cd /opt/portal && git pull && docker compose up -d --build
```

## If something is wrong

| What you see | Where to look |
|---|---|
| "Sign in again." on every page | `PORTAL_FIREBASE_PROJECT_ID` does not match the project the token came from |
| "This account has no access yet." | The Firebase user exists but has no row here. Step 7, or Admin → Users |
| Sign-in popup refuses the domain | The domain is not authorized in Firebase Auth settings |
| "The site has not been built yet" | The image built without `dist/`. Rebuild with `--build` |
| Traefik serves its own 404 | The labels did not match. Step 4 |
