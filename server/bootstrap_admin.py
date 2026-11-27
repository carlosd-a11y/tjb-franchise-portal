#!/usr/bin/env python3
"""
Create the first admin.

Firebase holds the password; this only grants that person access here. So the
Auth user is made first, in the Firebase console, and its UID is pasted in.

    export PORTAL_DB=/data/portal.db
    export BOOTSTRAP_UID=...            # Firebase console -> Authentication
    export BOOTSTRAP_EMAIL=you@yourdomain.com
    export BOOTSTRAP_NAME="Your Name"
    export BOOTSTRAP_CONFIRM=yes
    python3 bootstrap_admin.py

It refuses unless every one of those is set, and does nothing if an active
admin already exists. After this, add everyone else in Admin -> Users.
"""

import os
import re
import sys

from db import open_db, init_db

EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
UID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")


def fail(message: str) -> None:
    print(f"Refused: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    uid = os.environ.get("BOOTSTRAP_UID", "").strip()
    email = os.environ.get("BOOTSTRAP_EMAIL", "").strip().lower()
    name = os.environ.get("BOOTSTRAP_NAME", "").strip()

    if os.environ.get("BOOTSTRAP_CONFIRM") != "yes":
        fail("set BOOTSTRAP_CONFIRM=yes to go ahead.")
    if not UID.fullmatch(uid):
        fail("BOOTSTRAP_UID must be the Firebase Auth UID.")
    if not EMAIL.fullmatch(email) or len(email) > 120:
        fail("BOOTSTRAP_EMAIL must be a real address.")
    if not name or len(name) > 80:
        fail("BOOTSTRAP_NAME is missing.")

    conn = open_db()
    init_db(conn)

    existing = conn.execute("SELECT uid, email FROM users WHERE role = 'admin' AND active = 1").fetchall()
    if existing:
        print(f"An active admin already exists ({existing[0]['email']}). Nothing to do.")
        return

    conn.execute(
        "INSERT INTO users (uid, email, name, role, active) VALUES (?, ?, ?, 'admin', 1)"
        " ON CONFLICT (uid) DO UPDATE SET email = excluded.email, name = excluded.name,"
        " role = 'admin', active = 1",
        (uid, email, name),
    )
    print(f"{email} is now an admin. Sign in at the portal with the password Firebase holds.")


if __name__ == "__main__":
    main()
