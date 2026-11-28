"""Admin-written pages. Signed-in users read; only an admin writes."""

from flask import Blueprint, jsonify, request

from auth import active_user, admin_only, profile
from db import get_db, now
from errors import ApiError

bp = Blueprint("pages", __name__)

SLUGS = {"site-criteria"}
MAX_LENGTH = 20_000


def check(slug: str) -> None:
    if slug not in SLUGS:
        raise ApiError("Page not found.", 404)


@bp.get("/api/pages/<slug>")
@active_user
def read(slug: str):
    check(slug)
    row = get_db().execute("SELECT body, updated_at FROM pages WHERE slug = ?", (slug,)).fetchone()
    return jsonify({"body": row["body"] if row else "", "updatedAt": row["updated_at"] if row else None})


@bp.put("/api/pages/<slug>")
@admin_only
def write(slug: str):
    check(slug)
    body = (request.get_json(silent=True) or {}).get("body")
    if not isinstance(body, str) or len(body) > MAX_LENGTH:
        raise ApiError("That text is too long or missing.")
    get_db().execute(
        "INSERT INTO pages (slug, body, updated_at, updated_by) VALUES (?, ?, ?, ?)"
        " ON CONFLICT (slug) DO UPDATE SET body = excluded.body,"
        " updated_at = excluded.updated_at, updated_by = excluded.updated_by",
        (slug, body, now(), profile()["uid"]),
    )
    return jsonify({"ok": True})
