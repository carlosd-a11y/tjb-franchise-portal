"""
Locations, notes, history and the rejection warning.

Every allow line that firestore.rules had for a location update is a check in
the route that performs it. The transitions and their conditions are unchanged:

  claim      from pool, or from a claim with no activity for over 30 days
  advance    claimed -> researching -> touring -> submitted, owner or admin
  keep       owner or admin, refreshes the 30-day clock only
  pass       owner or admin, needs a reason, returns the row to the pool
  approve    admin, from submitted
  reject     admin, and writes a rejections row
  address    admin, and never on a rejected row (its rejection kept the old one)
  delete     admin
"""

from contextlib import contextmanager

from flask import Blueprint, jsonify, request

import serialize
import validators
from auth import active_user, admin_only, is_admin, profile
from db import get_db, is_stale, new_id, now
from errors import ApiError
from model import (
    ACTIVE_CLAIM_STATUSES,
    CLAIM_WINDOW_DAYS,
    LOCATION_LIST_LIMIT,
    NEXT_STATUS,
    REJECTED_ADDRESS_LOCKED,
)

bp = Blueprint("locations", __name__)


@contextmanager
def writing():
    """BEGIN IMMEDIATE, so two franchisees cannot both win the same claim."""
    conn = get_db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def row_or_404(conn, location_id: str):
    row = conn.execute("SELECT * FROM locations WHERE id = ?", (location_id,)).fetchone()
    if row is None:
        raise ApiError("Location not found.", 404)
    return row


def claimable(row) -> bool:
    if row["status"] == "pool":
        return True
    return row["status"] in ACTIVE_CLAIM_STATUSES and is_stale(row["last_activity_at"], CLAIM_WINDOW_DAYS)


def owns(row) -> bool:
    return row["claimed_by"] == profile()["uid"]


def add_history(conn, location_id, from_status, to_status, reason):
    me = profile()
    conn.execute(
        "INSERT INTO history (id, location_id, from_status, to_status, actor_uid, actor_name, reason, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (new_id(), location_id, from_status, to_status, me["uid"], me["name"], reason, now()),
    )


def rejection_hits(conn, normalized_address: str, zip_code: str) -> list[dict]:
    """Address hits win. A different address in the same ZIP is still a warning."""
    hits, seen = [], set()
    by_address = conn.execute(
        "SELECT * FROM rejections WHERE normalized_address = ? LIMIT 10", (normalized_address,)
    ).fetchall()
    for row in by_address:
        seen.add(row["id"])
        hits.append(_hit(row, "address"))
    by_zip = conn.execute("SELECT * FROM rejections WHERE zip = ? LIMIT 10", (zip_code,)).fetchall()
    for row in by_zip:
        if row["id"] in seen or row["normalized_address"] == normalized_address:
            continue
        hits.append(_hit(row, "zip"))
        if len(hits) >= 10:
            break
    return hits[:10]


def _hit(row, match: str) -> dict:
    return {
        "id": row["id"],
        "reasonCode": row["reason_code"],
        "reasonText": row["reason_text"],
        "match": match,
        "city": row["city"],
        "state": row["state"],
        "zip": row["zip"],
    }


# ── Reading ───────────────────────────────────────────────────────────────────

@bp.get("/api/me")
@active_user
def me():
    return jsonify(profile())


@bp.get("/api/locations")
@active_user
def list_locations():
    rows = get_db().execute(
        "SELECT * FROM locations ORDER BY last_activity_at DESC LIMIT ?", (LOCATION_LIST_LIMIT,)
    ).fetchall()
    return jsonify({"locations": [serialize.location(row, profile()) for row in rows]})


@bp.get("/api/locations/<location_id>")
@active_user
def get_location(location_id: str):
    conn = get_db()
    row = row_or_404(conn, location_id)
    notes = conn.execute(
        "SELECT * FROM notes WHERE location_id = ? ORDER BY created_at, id", (location_id,)
    ).fetchall()
    history = conn.execute(
        "SELECT * FROM history WHERE location_id = ? ORDER BY created_at, id", (location_id,)
    ).fetchall()
    return jsonify(
        {
            "location": serialize.location(row, profile()),
            "notes": [serialize.note(item) for item in notes],
            "history": [serialize.history(item) for item in history],
        }
    )


@bp.get("/api/rejection-hits")
@active_user
def hits():
    normalized = request.args.get("normalizedAddress", "")
    zip_code = request.args.get("zip", "")
    if not normalized or not zip_code:
        return jsonify({"hits": []})
    return jsonify({"hits": rejection_hits(get_db(), normalized, zip_code)})


# ── Creating ──────────────────────────────────────────────────────────────────

@bp.post("/api/locations")
@active_user
def create_location():
    fields = validators.draft_location(request.get_json(silent=True) or {})
    me = profile()
    stamp = now()
    with writing() as conn:
        if conn.execute(
            "SELECT 1 FROM locations WHERE normalized_address = ?", (fields["normalizedAddress"],)
        ).fetchone():
            raise ApiError("That address is already in the list.", 409)
        location_id = new_id()
        conn.execute(
            "INSERT INTO locations (id, address, city, state, zip, normalized_address, lat, lng, sqft,"
            " rent, source, status, claimed_by, claimed_by_name, claimed_at, last_activity_at,"
            " created_by, created_at, pass_reason, listing_url, contact_name, contact_phone)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 'pool', NULL, NULL, NULL, ?, ?, ?, NULL, ?, ?, ?)",
            (
                location_id, fields["address"], fields["city"], fields["state"], fields["zip"],
                fields["normalizedAddress"], fields["lat"], fields["lng"], fields["sqft"],
                fields["rent"], stamp, me["uid"], stamp,
                fields["listingUrl"], fields["contactName"], fields["contactPhone"],
            ),
        )
    return jsonify({"id": location_id}), 201


# ── Transitions ───────────────────────────────────────────────────────────────

@bp.post("/api/locations/<location_id>/claim")
@active_user
def claim(location_id: str):
    me = profile()
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if not claimable(row):
            raise ApiError("Someone else already claimed this.", 409)
        if row["claimed_by"] == me["uid"]:
            raise ApiError("You already have this one.", 409)
        stamp = now()
        conn.execute(
            "UPDATE locations SET status = 'claimed', claimed_by = ?, claimed_by_name = ?,"
            " claimed_at = ?, last_activity_at = ?, pass_reason = NULL WHERE id = ?",
            (me["uid"], me["name"], stamp, stamp, location_id),
        )
        add_history(conn, location_id, row["status"], "claimed", None)
    return jsonify({"ok": True})


@bp.post("/api/locations/<location_id>/advance")
@active_user
def advance(location_id: str):
    with writing() as conn:
        row = row_or_404(conn, location_id)
        following = NEXT_STATUS.get(row["status"])
        if not following:
            raise ApiError("This location can't move forward.", 409)
        if not (owns(row) or is_admin()):
            raise ApiError("Only the owner can move this forward.", 403)
        conn.execute(
            "UPDATE locations SET status = ?, last_activity_at = ? WHERE id = ?",
            (following, now(), location_id),
        )
        add_history(conn, location_id, row["status"], following, None)
    return jsonify({"ok": True})


@bp.post("/api/locations/<location_id>/keep")
@active_user
def keep(location_id: str):
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if row["status"] not in ACTIVE_CLAIM_STATUSES:
            raise ApiError("That change is no longer available.", 409)
        if not (owns(row) or is_admin()):
            raise ApiError("You don't have access to that.", 403)
        conn.execute("UPDATE locations SET last_activity_at = ? WHERE id = ?", (now(), location_id))
    return jsonify({"ok": True})


@bp.post("/api/locations/<location_id>/pass")
@active_user
def pass_location(location_id: str):
    text = validators.reason((request.get_json(silent=True) or {}).get("reason"))
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if row["status"] not in ACTIVE_CLAIM_STATUSES:
            raise ApiError("This location can't be passed.", 409)
        if not (owns(row) or is_admin()):
            raise ApiError("You don't have access to that.", 403)
        conn.execute(
            "UPDATE locations SET status = 'pool', claimed_by = NULL, claimed_by_name = NULL,"
            " claimed_at = NULL, last_activity_at = ?, pass_reason = ? WHERE id = ?",
            (now(), text, location_id),
        )
        add_history(conn, location_id, row["status"], "pool", text)
    return jsonify({"ok": True})


@bp.post("/api/locations/<location_id>/approve")
@admin_only
def approve(location_id: str):
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if row["status"] != "submitted":
            raise ApiError("Only a submitted location can be approved.", 409)
        conn.execute(
            "UPDATE locations SET status = 'approved', last_activity_at = ? WHERE id = ?",
            (now(), location_id),
        )
        add_history(conn, location_id, row["status"], "approved", None)
    return jsonify({"ok": True})


@bp.post("/api/locations/<location_id>/reject")
@admin_only
def reject(location_id: str):
    payload = request.get_json(silent=True) or {}
    code = validators.reason_code(payload.get("reasonCode"))
    text = validators.reason(payload.get("reasonText"))
    me = profile()
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if row["status"] not in ["pool", *ACTIVE_CLAIM_STATUSES]:
            raise ApiError("This location is already closed.", 409)
        stamp = now()
        conn.execute(
            "UPDATE locations SET status = 'rejected', last_activity_at = ? WHERE id = ?",
            (stamp, location_id),
        )
        conn.execute(
            "INSERT INTO rejections (id, address, city, state, zip, normalized_address, rejected_by,"
            " rejected_at, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                new_id(), row["address"], row["city"], row["state"], row["zip"],
                row["normalized_address"], me["name"], stamp, code, text,
            ),
        )
        add_history(conn, location_id, row["status"], "rejected", text)
    return jsonify({"ok": True})


@bp.patch("/api/locations/<location_id>/address")
@admin_only
def edit_address(location_id: str):
    fields = validators.address_fields(request.get_json(silent=True) or {})
    with writing() as conn:
        row = row_or_404(conn, location_id)
        if row["status"] == "rejected":
            raise ApiError(REJECTED_ADDRESS_LOCKED, 409)
        clash = conn.execute(
            "SELECT 1 FROM locations WHERE normalized_address = ? AND id != ?",
            (fields["normalizedAddress"], location_id),
        ).fetchone()
        if clash:
            raise ApiError("That address is already in the list.", 409)
        conn.execute(
            "UPDATE locations SET address = ?, city = ?, state = ?, zip = ?, normalized_address = ?"
            " WHERE id = ?",
            (
                fields["address"], fields["city"], fields["state"], fields["zip"],
                fields["normalizedAddress"], location_id,
            ),
        )
    return jsonify({"ok": True})


@bp.delete("/api/locations/<location_id>")
@admin_only
def delete_location(location_id: str):
    with writing() as conn:
        row_or_404(conn, location_id)
        conn.execute("DELETE FROM locations WHERE id = ?", (location_id,))
    return jsonify({"ok": True})


# ── Notes ─────────────────────────────────────────────────────────────────────

@bp.post("/api/locations/<location_id>/notes")
@active_user
def add_note(location_id: str):
    text = validators.note_text((request.get_json(silent=True) or {}).get("text"))
    me = profile()
    with writing() as conn:
        row = row_or_404(conn, location_id)
        conn.execute(
            "INSERT INTO notes (id, location_id, text, author_uid, author_name, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (new_id(), location_id, text, me["uid"], me["name"], now()),
        )
        if row["status"] in ACTIVE_CLAIM_STATUSES and (owns(row) or is_admin()):
            conn.execute("UPDATE locations SET last_activity_at = ? WHERE id = ?", (now(), location_id))
    return jsonify({"ok": True}), 201


@bp.patch("/api/locations/<location_id>/notes/<note_id>")
@active_user
def edit_note(location_id: str, note_id: str):
    text = validators.note_text((request.get_json(silent=True) or {}).get("text"))
    with writing() as conn:
        row = conn.execute(
            "SELECT * FROM notes WHERE id = ? AND location_id = ?", (note_id, location_id)
        ).fetchone()
        if row is None:
            raise ApiError("Note not found.", 404)
        if row["author_uid"] != profile()["uid"]:
            raise ApiError("You can only edit your own note.", 403)
        conn.execute("UPDATE notes SET text = ? WHERE id = ?", (text, note_id))
    return jsonify({"ok": True})
