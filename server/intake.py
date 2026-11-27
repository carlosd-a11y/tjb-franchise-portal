"""
Bot intake.

Replaces api/intake.php. Same contract: a bearer key per platform, 409 on an
address already listed, warnings when the address or ZIP was rejected before,
and a rate limit per key and per address.

Which platforms may post is managed in scouts.py, from Admin -> Scouts.

The old version reached Firestore with a service account that bypassed the
security rules entirely, with a PHP allow-list as the only control. This runs
through the same checks as everything else and can only create pool rows.
"""

import hashlib
import time

from flask import Blueprint, jsonify, request

import validators
from auth import bearer
from db import get_db, new_id, now
from errors import ApiError
from locations import rejection_hits
from scouts import authenticate, note_seen

bp = Blueprint("intake", __name__)

MAX_BODY = 8192
PER_KEY_PER_HOUR = 60
WINDOW = 3600


def allow(conn, bucket: str, limit: int) -> bool:
    window_start = int(time.time()) // WINDOW * WINDOW
    digest = hashlib.sha256(bucket.encode()).hexdigest()
    conn.execute(
        "INSERT INTO intake_hits (bucket, window_start, count) VALUES (?, ?, 1)"
        " ON CONFLICT (bucket, window_start) DO UPDATE SET count = count + 1",
        (digest, window_start),
    )
    row = conn.execute(
        "SELECT count FROM intake_hits WHERE bucket = ? AND window_start = ?", (digest, window_start)
    ).fetchone()
    conn.execute("DELETE FROM intake_hits WHERE window_start < ?", (window_start - WINDOW,))
    return row["count"] <= limit


@bp.post("/api/intake")
def intake():
    conn = get_db()
    client_ip = (request.headers.get("X-Forwarded-For", "") or request.remote_addr or "unknown").split(",")[0].strip()
    if not allow(conn, f"ip:{client_ip}", max(PER_KEY_PER_HOUR * 4, 30)):
        raise ApiError("Rate limit exceeded", 429)

    scout = authenticate(conn, bearer())
    if scout is None:
        raise ApiError("Unauthorized", 401)
    source = scout["name"]
    if not allow(conn, f"key:{source}", PER_KEY_PER_HOUR):
        raise ApiError("Rate limit exceeded", 429)

    if request.content_length and request.content_length > MAX_BODY:
        raise ApiError("Body too large", 413)

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Body must be a JSON object.")
    allowed = {"address", "city", "state", "zip", "sqft", "rent", "lat", "lng"}
    unknown = set(payload) - allowed
    if unknown:
        raise ApiError(f"Unknown field: {sorted(unknown)[0]}")

    fields = validators.draft_location(payload)
    warnings = rejection_hits(conn, fields["normalizedAddress"], fields["zip"])

    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute(
            "SELECT id FROM locations WHERE normalized_address = ?", (fields["normalizedAddress"],)
        ).fetchone()
        if existing:
            note_seen(conn, scout["id"], created=False)
            conn.execute("COMMIT")
            return jsonify(
                {"ok": False, "error": "duplicate", "id": existing["id"], "rejectionWarnings": warnings}
            ), 409

        location_id = new_id()
        stamp = now()
        conn.execute(
            "INSERT INTO locations (id, address, city, state, zip, normalized_address, lat, lng, sqft,"
            " rent, source, status, claimed_by, claimed_by_name, claimed_at, last_activity_at,"
            " created_by, created_at, pass_reason)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pool', NULL, NULL, NULL, ?, ?, ?, NULL)",
            (
                location_id, fields["address"], fields["city"], fields["state"], fields["zip"],
                fields["normalizedAddress"], fields["lat"], fields["lng"], fields["sqft"],
                fields["rent"], f"bot:{source}", stamp, f"bot:{source}", stamp,
            ),
        )
        note_seen(conn, scout["id"], created=True)
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
    return jsonify({"ok": True, "id": location_id, "rejectionWarnings": warnings}), 201
