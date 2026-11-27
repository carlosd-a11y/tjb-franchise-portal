"""
Test harness.

Google's signing keys are replaced with a key pair made here, so the tests mint
their own tokens and never reach the network. Everything else is the real app
against a temporary database file.
"""

import sys
import time
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import create_app  # noqa: E402
from db import new_id, now, open_db  # noqa: E402

PROJECT = "tjb-franchise-portal"


class FakeKeys:
    def __init__(self, public_key):
        self._public_key = public_key

    def get(self, kid):
        if kid != "test-key":
            from tokens import TokenError

            raise TokenError("Unknown signing key.")
        return self._public_key


@pytest.fixture(scope="session")
def keypair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    return pem, private.public_key()


@pytest.fixture
def make_token(keypair):
    private_pem, _ = keypair

    def build(uid: str, second_factor: bool = True, **overrides):
        issued = int(time.time())
        claims = {
            "iss": f"https://securetoken.google.com/{PROJECT}",
            "aud": PROJECT,
            "sub": uid,
            "iat": issued,
            "exp": issued + 3600,
            "firebase": {"sign_in_second_factor": "totp"} if second_factor else {},
        }
        claims.update(overrides)
        return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": "test-key"})

    return build


@pytest.fixture
def app(tmp_path, keypair, monkeypatch):
    _, public_key = keypair
    monkeypatch.setenv("PORTAL_DB", str(tmp_path / "test.db"))
    return create_app(
        FIREBASE_PROJECT_ID=PROJECT,
        REQUIRE_SECOND_FACTOR=False,
        GOOGLE_KEYS=FakeKeys(public_key),
        DIST=tmp_path / "dist",
        TESTING=True,
    )


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def seed(app):
    """Two franchisees, one admin, one turned off, and one pool location."""
    with app.app_context():
        from db import get_db

        conn = get_db()
        conn.executemany(
            "INSERT INTO users (uid, email, name, role, active) VALUES (?, ?, ?, ?, ?)",
            [
                ("alex", "alex@example.test", "Alex Rivera", "franchisee", 1),
                ("jordan", "jordan@example.test", "Jordan Diaz", "franchisee", 1),
                ("avery", "avery@example.test", "Avery Admin", "admin", 1),
                ("sam", "sam@example.test", "Sam Off", "franchisee", 0),
            ],
        )
    return None


def add_location(app, **overrides):
    from db import get_db

    fields = {
        "id": overrides.get("id", new_id()),
        "address": "100 Demo Harbor Dr",
        "city": "Miami",
        "state": "FL",
        "zip": "33139",
        "normalized_address": overrides.get("normalized_address", f"key-{new_id()}"),
        "lat": None,
        "lng": None,
        "sqft": 1450,
        "rent": 8200,
        "source": "manual",
        "status": "pool",
        "claimed_by": None,
        "claimed_by_name": None,
        "claimed_at": None,
        "last_activity_at": now(),
        "created_by": "avery",
        "created_at": now(),
        "pass_reason": None,
    }
    fields.update({k: v for k, v in overrides.items()})
    with app.app_context():
        get_db().execute(
            "INSERT INTO locations (id, address, city, state, zip, normalized_address, lat, lng, sqft,"
            " rent, source, status, claimed_by, claimed_by_name, claimed_at, last_activity_at,"
            " created_by, created_at, pass_reason)"
            " VALUES (:id, :address, :city, :state, :zip, :normalized_address, :lat, :lng, :sqft,"
            " :rent, :source, :status, :claimed_by, :claimed_by_name, :claimed_at, :last_activity_at,"
            " :created_by, :created_at, :pass_reason)",
            fields,
        )
    return fields["id"]


def days_ago(count: int) -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) - timedelta(days=count)).strftime("%Y-%m-%dT%H:%M:%SZ")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def scout(app):
    """A registered scouting platform and the key it posts with."""
    from db import get_db, new_id, now
    from scouts import hash_key, make_key

    key = make_key()
    with app.app_context():
        get_db().execute(
            "INSERT INTO scouts (id, name, label, key_hash, active, created_by, created_at, submitted)"
            " VALUES (?, 'muse', 'Muse', ?, 1, 'avery', ?, 0)",
            (new_id(), hash_key(key), now()),
        )
    return key
