"""
Invitations.

An admin enters a name, an email and a role. The server stores the invite with
a one-time token, emails a link, and the person sets their own password on the
other end. Nobody has to be created by hand in two consoles any more.

Three rules hold this together:

  * Only the hash of the token is stored, so this file cannot be read to let
    someone in. The token itself exists in the email and nowhere else.
  * Accepting needs both halves: the token from the email, and a signed-in
    Firebase account whose email matches the invite. One without the other
    grants nothing.
  * A Firebase login still grants nothing on its own. Accepting is what writes
    the users row, and that row is what every other route checks.

Mail failures do not fail the invite: the admin gets the link to send by hand.
"""

import hashlib
import secrets
from datetime import timedelta

import mail
import serialize
import validators
from auth import admin_only, bearer, profile
from db import get_db, now, parse_time
from errors import ApiError
from flask import Blueprint, current_app, jsonify, request
from model import LIMITS
from tokens import TokenError, verify

bp = Blueprint("invites", __name__)

VALID_DAYS = 7


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def make_token() -> str:
    return secrets.token_urlsafe(32)


def expiry() -> str:
    return (parse_time(now()) + timedelta(days=VALID_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")


def link_for(token: str) -> str:
    base = current_app.config["BASE_URL"].rstrip("/")
    return f"{base}/invite/{token}"


def issue(conn, address: str, name: str, role: str, by_uid: str) -> str:
    """Creates or replaces the invite and returns the token, which is shown once."""
    token = make_token()
    conn.execute(
        "INSERT INTO invites (id, email, name, role, created_by, created_at, status,"
        " token_hash, expires_at, accepted_at)"
        " VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, NULL)"
        " ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role,"
        " created_by = excluded.created_by, created_at = excluded.created_at,"
        " status = 'pending', token_hash = excluded.token_hash,"
        " expires_at = excluded.expires_at, accepted_at = NULL",
        (address, address, name, role, by_uid, now(), hash_token(token), expiry()),
    )
    return token


def deliver(address: str, name: str, token: str) -> dict:
    """Sends the mail and reports what happened, without ever raising."""
    result = {"link": link_for(token), "emailed": False}
    try:
        mail.send_invite(address, name, result["link"], VALID_DAYS)
        result["emailed"] = True
    except mail.MailNotConfigured:
        result["problem"] = "Email is not set up on the server, so send this link yourself."
    except Exception as error:  # noqa: BLE001 - any failure here is reported, not raised
        current_app.logger.warning("invite email to %s failed: %s", address, error)
        result["problem"] = "The email did not go out, so send this link yourself."
    return result


@bp.get("/api/invites")
@admin_only
def list_invites():
    rows = get_db().execute("SELECT * FROM invites ORDER BY created_at DESC").fetchall()
    return jsonify({"invites": [serialize.invite(row) for row in rows]})


@bp.post("/api/invites")
@admin_only
def save_invite():
    payload = request.get_json(silent=True) or {}
    address = validators.email(payload.get("email"))
    name = validators.clean(payload.get("name"), LIMITS["name"], "a name")
    role = validators.role(payload.get("role"))
    token = issue(get_db(), address, name, role, profile()["uid"])
    return jsonify({"ok": True, **deliver(address, name, token)}), 201


@bp.post("/api/invites/<invite_id>/resend")
@admin_only
def resend_invite(invite_id: str):
    conn = get_db()
    row = conn.execute("SELECT * FROM invites WHERE id = ?", (invite_id,)).fetchone()
    if row is None:
        raise ApiError("Invite not found.", 404)
    if row["status"] != "pending":
        raise ApiError("That invite has already been used.", 409)
    token = issue(conn, row["email"], row["name"], row["role"], profile()["uid"])
    return jsonify({"ok": True, **deliver(row["email"], row["name"], token)})


@bp.patch("/api/invites/<invite_id>")
@admin_only
def update_invite(invite_id: str):
    status = (request.get_json(silent=True) or {}).get("status")
    if status not in ("pending", "provisioned"):
        raise ApiError("That status is not valid.")
    conn = get_db()
    if conn.execute("SELECT 1 FROM invites WHERE id = ?", (invite_id,)).fetchone() is None:
        raise ApiError("Invite not found.", 404)
    conn.execute("UPDATE invites SET status = ? WHERE id = ?", (status, invite_id))
    return jsonify({"ok": True})


@bp.delete("/api/invites/<invite_id>")
@admin_only
def delete_invite(invite_id: str):
    conn = get_db()
    if conn.execute("SELECT 1 FROM invites WHERE id = ?", (invite_id,)).fetchone() is None:
        raise ApiError("Invite not found.", 404)
    conn.execute("DELETE FROM invites WHERE id = ?", (invite_id,))
    return jsonify({"ok": True})


def live_invite(conn, token: str):
    """The pending, unexpired invite this token belongs to, or an ApiError."""
    if not isinstance(token, str) or not 20 <= len(token) <= 200:
        raise ApiError("That invitation link is not valid.", 404)
    row = conn.execute(
        "SELECT * FROM invites WHERE token_hash = ?", (hash_token(token),)
    ).fetchone()
    if row is None or row["status"] != "pending":
        raise ApiError("That invitation has already been used, or was replaced.", 404)
    deadline = parse_time(row["expires_at"])
    if deadline is None or deadline < parse_time(now()):
        raise ApiError("That invitation has expired. Ask for a new one.", 410)
    return row


@bp.get("/api/invites/accept/<token>")
def describe_invite(token: str):
    """Public: what the set-your-password page shows before anyone signs in."""
    row = live_invite(get_db(), token)
    return jsonify({"email": row["email"], "name": row["name"]})


@bp.post("/api/invites/accept")
def accept_invite():
    """
    Turns a Firebase account into a portal account.

    The caller sends the token from the email and an ID token for the account
    they have just created. Both must agree on the address before any row is
    written. A second factor is not required here: the account is minutes old
    and cannot have enrolled one yet.
    """
    conn = get_db()
    payload = request.get_json(silent=True) or {}
    row = live_invite(conn, payload.get("token"))

    try:
        claims = verify(
            bearer(),
            current_app.config["FIREBASE_PROJECT_ID"],
            current_app.config["GOOGLE_KEYS"],
            require_second_factor=False,
        )
    except TokenError as error:
        raise ApiError(str(error), 401) from error

    address = str(claims.get("email") or "").strip().lower()
    if not address or address != row["email"]:
        raise ApiError("Sign in with the address the invitation was sent to.", 403)

    conn.execute("BEGIN IMMEDIATE")
    try:
        existing = conn.execute(
            "SELECT uid FROM users WHERE uid = ?", (claims["sub"],)
        ).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO users (uid, email, name, role, active) VALUES (?, ?, ?, ?, 1)",
                (claims["sub"], row["email"], row["name"], row["role"]),
            )
        conn.execute(
            "UPDATE invites SET status = 'provisioned', accepted_at = ?, token_hash = NULL"
            " WHERE id = ?",
            (now(), row["id"]),
        )
    except Exception:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
    return jsonify({"ok": True})
