#!/bin/sh
# One command to put the portal on the VPS.
#
#   git clone https://github.com/carlosd-a11y/tjb-franchise-portal.git /opt/portal
#   cd /opt/portal && ./deploy.sh
#
# It asks for the Firebase config once, builds, starts, and checks itself. Run
# it again later to update: it keeps the config and the database.
#
# It touches nothing outside this directory. It does not change DNS, does not
# log in to Hostinger, and does not go near the company website. The DNS change
# is left to a person on purpose: it is the one step that can take a live site
# down, and it wants eyes on it.

set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"

say() { printf '\n== %s\n' "$1"; }
die() { printf '\nStopped: %s\n' "$1" >&2; exit 1; }

# ── Checks ───────────────────────────────────────────────────────────────────

command -v docker >/dev/null 2>&1 || die "docker is not installed."
docker compose version >/dev/null 2>&1 || die "docker compose is not available."
[ -f docker-compose.yml ] || die "run this from the portal directory."

# The container runs as 1000:1000, so the database directory has to belong to
# that user. Created by root, SQLite inside the container cannot write to it and
# the container crash-loops on "unable to open database file".
mkdir -p data
chown -R 1000:1000 data 2>/dev/null || true

# ── The browser config ───────────────────────────────────────────────────────

if [ -f .env.production ] && grep -q '^VITE_FIREBASE_API_KEY=.' .env.production; then
  say "Firebase config already set. Keeping it."
else
  say "Firebase config"
  cat <<'HELP'
Firebase console -> Project settings -> General -> Your apps -> Franchise portal.
Copy the whole config block and paste it here, then press Ctrl-D.

It looks like this:

  const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    ...
  };

HELP
  pasted=$(cat)
  [ -n "$pasted" ] || die "nothing was pasted."

  printf '%s' "$pasted" | python3 -I server/read_firebase_config.py \
    || die "could not read that config. Paste the whole block, including the braces."
fi

# ── The server config ────────────────────────────────────────────────────────

if [ ! -f .env ]; then
  printf 'PORTAL_FIREBASE_PROJECT_ID=tjb-franchise-portal\nPORTAL_REQUIRE_TOTP=false\n' > .env
  say "Wrote .env"
fi

chmod 600 .env .env.production 2>/dev/null || true

# ── Build, then start ────────────────────────────────────────────────────────

say "Building. This is the busy part: a few minutes, both cores."
docker compose build

say "Starting"
docker compose up -d

say "Waiting for it to come up"
i=0
while [ "$i" -lt 60 ]; do
  if docker compose exec -T portal python3 -c \
      "import urllib.request;urllib.request.urlopen('http://127.0.0.1:5005/healthz')" >/dev/null 2>&1; then
    printf 'healthy\n'
    break
  fi
  i=$((i + 1))
  sleep 2
done
[ "$i" -lt 60 ] || die "it did not come up. Look at: docker compose logs --tail 50"

# ── What is left ─────────────────────────────────────────────────────────────

say "Running"
docker compose ps

cat <<'NEXT'

Done on this machine. Two things are left, and both are deliberately by hand.

1. DNS, at GoDaddy. Change ONLY the A record whose host is "franchise", to
   2.24.76.133.

   Do not touch "@", "www", "platia" or any MX record. "franchise" currently
   points at the same address as the company website, so match on the host
   name, never on the address. ./server/check_site.sh checks the records that
   must not move; run it before and after.

2. Your admin account, once DNS has moved. Firebase console -> Authentication
   -> Add user, mark the email verified, copy the UID, then:

   docker compose exec portal sh -c 'cd server && \
     BOOTSTRAP_UID=<uid> BOOTSTRAP_EMAIL=<email> \
     BOOTSTRAP_NAME="Carlos Lopez" BOOTSTRAP_CONFIRM=yes \
     python3 bootstrap_admin.py'

To update later: git pull && ./deploy.sh
To remove it entirely: docker compose down   (nothing else on this box is touched)

NEXT
