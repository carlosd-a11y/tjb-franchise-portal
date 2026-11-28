"""
Users and the rejected-locations list. Invites live in invites.py.

Reading rejections is open to any active user, because the warning is the point.
Everything that writes here is admin only, as it was in firestore.rules.
"""

from flask import Blueprint, jsonify, request

import serialize
import validators
from auth import active_user, admin_only, profile
from db import get_db, new_id, now
from errors import ApiError
from model import LIMITS
from normalize import normalize_address

bp = Blueprint("admin", __name__)


@bp.get("/api/rejections")
@active_user
def list_rejections():
    rows = get_db().execute("SELECT * FROM rejections ORDER BY rejected_at DESC").fetchall()
    return jsonify({"rejections": [serialize.rejection(row) for row in rows]})


@bp.post("/api/rejections/import")
@admin_only
def import_rejections():
    rows = (request.get_json(silent=True) or {}).get("rows")
    if not isinstance(rows, list) or not rows:
        raise ApiError("Nothing to import.")
    if len(rows) > 5000:
        raise ApiError("That file is too large to import at once.")

    prepared = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ApiError(f"Row {index} is not valid.")
        try:
            fields = validators.address_fields(row)
            prepared.append(
                (
                    new_id(),
                    fields["address"],
                    fields["city"],
                    fields["state"],
                    fields["zip"],
                    normalize_address(fields["address"], fields["city"], fields["state"], fields["zip"]),
                    validators.clean(row.get("rejectedBy"), LIMITS["rejected_by"], "who rejected it"),
                    str(row.get("rejectedAt") or now()),
                    validators.reason_code(row.get("reasonCode")),
                    validators.reason(row.get("reasonText"), "a reason"),
                )
            )
        except ApiError as error:
            raise ApiError(f"Row {index}: {error.message}") from error

    conn = get_db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.executemany(
            "INSERT INTO rejections (id, address, city, state, zip, normalized_address, rejected_by,"
            " rejected_at, reason_code, reason_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            prepared,
        )
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
    return jsonify({"imported": len(prepared)}), 201


@bp.get("/api/users")
@admin_only
def list_users():
    rows = get_db().execute("SELECT * FROM users ORDER BY email").fetchall()
    return jsonify({"users": [serialize.user(row) for row in rows]})


@bp.put("/api/users/<user_id>")
@admin_only
def save_user(user_id: str):
    payload = request.get_json(silent=True) or {}
    uid = validators.uid(user_id)
    fields = {
        "email": validators.email(payload.get("email")),
        "name": validators.clean(payload.get("name"), LIMITS["name"], "a name"),
        "role": validators.role(payload.get("role")),
        "active": bool(payload.get("active")),
    }
    me = profile()
    if uid == me["uid"] and (fields["role"] != "admin" or not fields["active"]):
        raise ApiError("You cannot remove your own access.", 409)

    get_db().execute(
        "INSERT INTO users (uid, email, name, role, active) VALUES (?, ?, ?, ?, ?)"
        " ON CONFLICT (uid) DO UPDATE SET email = excluded.email, name = excluded.name,"
        " role = excluded.role, active = excluded.active",
        (uid, fields["email"], fields["name"], fields["role"], int(fields["active"])),
    )
    return jsonify({"ok": True})


