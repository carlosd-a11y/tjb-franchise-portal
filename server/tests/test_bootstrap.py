"""The first admin, and the guards that stop it running by accident."""

import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "bootstrap_admin.py"

GOOD = {
    "BOOTSTRAP_UID": "firebase-uid-123",
    "BOOTSTRAP_EMAIL": "owner@example.test",
    "BOOTSTRAP_NAME": "Owner",
    "BOOTSTRAP_CONFIRM": "yes",
}


def run(tmp_path, **overrides):
    env = {
        "PATH": "/usr/bin:/bin",
        "PORTAL_DB": str(tmp_path / "boot.db"),
        "PYTHONPATH": str(SCRIPT.parent),
        **GOOD,
        **overrides,
    }
    for key, value in list(env.items()):
        if value is None:
            del env[key]
    return subprocess.run(
        [sys.executable, str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60
    )


def test_it_creates_the_first_admin(tmp_path):
    result = run(tmp_path)
    assert result.returncode == 0, result.stderr
    assert "is now an admin" in result.stdout

    import sqlite3

    conn = sqlite3.connect(tmp_path / "boot.db")
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM users").fetchone()
    assert row["role"] == "admin"
    assert row["active"] == 1
    assert row["email"] == "owner@example.test"


def test_it_does_nothing_when_an_admin_exists(tmp_path):
    assert run(tmp_path).returncode == 0
    second = run(tmp_path, BOOTSTRAP_UID="someone-else", BOOTSTRAP_EMAIL="other@example.test")
    assert second.returncode == 0
    assert "already exists" in second.stdout

    import sqlite3

    conn = sqlite3.connect(tmp_path / "boot.db")
    assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 1


@pytest.mark.parametrize(
    "change",
    [
        {"BOOTSTRAP_CONFIRM": None},
        {"BOOTSTRAP_CONFIRM": "no"},
        {"BOOTSTRAP_UID": ""},
        {"BOOTSTRAP_UID": "has spaces"},
        {"BOOTSTRAP_EMAIL": "not-an-email"},
        {"BOOTSTRAP_NAME": ""},
    ],
)
def test_it_refuses_without_every_guard(tmp_path, change):
    result = run(tmp_path, **change)
    assert result.returncode == 1
    assert "Refused" in result.stderr
