"""
Scouting platforms.

Muse, Grokbot and anything after them push finds to /api/intake. Each one is
registered here by an admin, from Admin -> Scouts, and gets its own key. Adding
a platform used to mean editing a file on the server and restarting; it is now
a form in the browser.

The key is generated here, shown once, and never stored: only its SHA-256 hash
is kept, so this table is useless to anyone who copies it.
"""

import hashlib
import re
import secrets

from flask import Blueprint, jsonify, request

import serialize
from auth import admin_only, profile
from db import get_db, new_id, now
from errors import ApiError

bp = Blueprint("scouts", __name__)

NAME = re.compile(r"^[a-z0-9-]{1,24}$")


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def make_key() -> str:
    return secrets.token_urlsafe(32)


def authenticate(conn, presented: str):
    """
    The scout behind a bearer key, or nothing.

    The lookup is on the hash, so there is no string comparison against a stored
    secret to time. A paused scout is refused exactly like an unknown one: a
    platform that has been turned off learns nothing from the answer.
    """
    if not presented:
        return None
    return conn.execute(
        "SELECT * FROM scouts WHERE key_hash = ? AND active = 1", (hash_key(presented),)
    ).fetchone()


def note_seen(conn, scout_id: str, created: bool) -> None:
    conn.execute(
        "UPDATE scouts SET last_seen_at = ?, submitted = submitted + ? WHERE id = ?",
        (now(), 1 if created else 0, scout_id),
    )


@bp.get("/api/scouts")
@admin_only
def list_scouts():
    rows = get_db().execute("SELECT * FROM scouts ORDER BY label").fetchall()
    return jsonify({"scouts": [serialize.scout(row) for row in rows]})


@bp.post("/api/scouts")
@admin_only
def create_scout():
    payload = request.get_json(silent=True) or {}
    label = str(payload.get("label") or "").strip()
    name = str(payload.get("name") or "").strip().lower()
    if not label or len(label) > 40:
        raise ApiError("Give the scout a name.")
    if not NAME.fullmatch(name):
        raise ApiError("Use lowercase letters, numbers and dashes for the short name.")

    key = make_key()
    conn = get_db()
    if conn.execute("SELECT 1 FROM scouts WHERE name = ?", (name,)).fetchone():
        raise ApiError("A scout with that short name already exists.", 409)

    scout_id = new_id()
    conn.execute(
        "INSERT INTO scouts (id, name, label, key_hash, active, created_by, created_at, submitted)"
        " VALUES (?, ?, ?, ?, 1, ?, ?, 0)",
        (scout_id, name, label, hash_key(key), profile()["uid"], now()),
    )
    row = conn.execute("SELECT * FROM scouts WHERE id = ?", (scout_id,)).fetchone()
    return jsonify({"scout": serialize.scout(row), "key": key}), 201


@bp.post("/api/scouts/<scout_id>/rotate")
@admin_only
def rotate_key(scout_id: str):
    """The old key stops working the moment this returns."""
    conn = get_db()
    if conn.execute("SELECT 1 FROM scouts WHERE id = ?", (scout_id,)).fetchone() is None:
        raise ApiError("Scout not found.", 404)
    key = make_key()
    conn.execute("UPDATE scouts SET key_hash = ? WHERE id = ?", (hash_key(key), scout_id))
    return jsonify({"key": key})


@bp.patch("/api/scouts/<scout_id>")
@admin_only
def update_scout(scout_id: str):
    payload = request.get_json(silent=True) or {}
    conn = get_db()
    row = conn.execute("SELECT * FROM scouts WHERE id = ?", (scout_id,)).fetchone()
    if row is None:
        raise ApiError("Scout not found.", 404)

    label = row["label"]
    if "label" in payload:
        label = str(payload.get("label") or "").strip()
        if not label or len(label) > 40:
            raise ApiError("Give the scout a name.")
    active = bool(payload.get("active")) if "active" in payload else bool(row["active"])

    conn.execute("UPDATE scouts SET label = ?, active = ? WHERE id = ?", (label, int(active), scout_id))
    return jsonify({"ok": True})


@bp.delete("/api/scouts/<scout_id>")
@admin_only
def delete_scout(scout_id: str):
    """
    The locations it already sent stay. They keep their bot:<name> source, which
    is history and should not disappear because a platform was dropped.
    """
    conn = get_db()
    if conn.execute("SELECT 1 FROM scouts WHERE id = ?", (scout_id,)).fetchone() is None:
        raise ApiError("Scout not found.", 404)
    conn.execute("DELETE FROM scouts WHERE id = ?", (scout_id,))
    return jsonify({"ok": True})
