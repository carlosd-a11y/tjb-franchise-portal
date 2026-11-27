#!/bin/sh
# Nightly copy of the database, kept for 14 days. Run inside the container:
#   docker exec -i franchise-portal sh < server/backup.sh
# Uses Python's sqlite3 backup API: the image has no sqlite3 command.
set -eu
exec python3 - <<'PY'
import datetime, os, pathlib, sqlite3, time

db = pathlib.Path(os.environ.get("PORTAL_DB", "/data/portal.db"))
out = pathlib.Path(os.environ.get("PORTAL_BACKUPS", str(db.parent / "backups")))
out.mkdir(parents=True, exist_ok=True)
target = out / f"portal-{datetime.datetime.now(datetime.timezone.utc):%Y%m%d}.db"

# A consistent snapshot even while the app is writing.
source = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
copy = sqlite3.connect(target)
source.backup(copy)
check = copy.execute("PRAGMA integrity_check").fetchone()[0]
copy.close()
source.close()
if check != "ok":
    raise SystemExit(f"backup failed the integrity check: {check}")

for old in out.glob("portal-*.db"):
    if old.stat().st_mtime < time.time() - 14 * 86400:
        old.unlink()
print(f"backed up to {target}")
PY
