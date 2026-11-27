"""
Who is asking, and may they.

Firebase says who the person is. This file says what they may do, which is the
half of firestore.rules that checked the users document. An account must exist
here and be active before any data is read or written: a valid Firebase login
on its own grants nothing.
"""

from functools import wraps

from flask import current_app, g, request

import serialize
from db import get_db
from errors import ApiError
from tokens import TokenError, verify


def bearer() -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise ApiError("Sign in again.", 401)
    return header[7:].strip()


def profile():
    """The signed-in, active user. Cached for the life of the request."""
    if "profile" in g:
        return g.profile

    claims = _claims()
    row = get_db().execute("SELECT * FROM users WHERE uid = ?", (claims["sub"],)).fetchone()
    if row is None:
        raise ApiError("This account has no access yet.", 403)
    if not row["active"]:
        raise ApiError("This account has been turned off.", 403)

    g.profile = serialize.user(row)
    return g.profile


def _claims() -> dict:
    try:
        return verify(
            bearer(),
            current_app.config["FIREBASE_PROJECT_ID"],
            current_app.config["GOOGLE_KEYS"],
            require_second_factor=current_app.config["REQUIRE_SECOND_FACTOR"],
        )
    except TokenError as error:
        raise ApiError(str(error), 401) from error


def active_user(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        profile()
        return view(*args, **kwargs)

    return wrapped


def admin_only(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if profile()["role"] != "admin":
            raise ApiError("You don't have access to that.", 403)
        return view(*args, **kwargs)

    return wrapped


def is_admin() -> bool:
    return profile()["role"] == "admin"
