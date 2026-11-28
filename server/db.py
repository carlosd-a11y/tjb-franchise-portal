"""
Database layer.

One way to open the file, for requests and jobs alike. WAL lets readers work
while a writer holds the file, and the busy timeout makes a second writer wait
its turn instead of failing outright.
"""

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import g

BASE_DIR = Path(__file__).parent
DEFAULT_DB = BASE_DIR / "portal.db"


def db_path() -> Path:
    return Path(os.environ.get("PORTAL_DB", DEFAULT_DB))


def open_db(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or db_path(), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = open_db()
    return g.db


def close_db(_exception=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript((BASE_DIR / "schema.sql").read_text())
    # A database made before these columns existed gets them added in place.
    have = {row[1] for row in conn.execute("PRAGMA table_info(locations)")}
    for column in ("listing_url", "contact_name", "contact_phone"):
        if column not in have:
            conn.execute(f"ALTER TABLE locations ADD COLUMN {column} TEXT")


def new_id() -> str:
    """URL-safe and inside the ^[A-Za-z0-9_-]{1,128}$ shape ids had before."""
    return secrets.token_urlsafe(9)


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def is_stale(last_activity_at: str | None, days: int) -> bool:
    moment = parse_time(last_activity_at)
    if moment is None:
        return False
    return moment + timedelta(days=days) < datetime.now(timezone.utc)
