"""The database error that cost an afternoon, made readable."""

import sqlite3

import pytest

from db import open_db


def test_an_unwritable_directory_explains_itself(tmp_path):
    missing = tmp_path / "not-there" / "portal.db"
    with pytest.raises(sqlite3.OperationalError) as caught:
        open_db(missing)
    message = str(caught.value)
    assert "Cannot open the database" in message
    assert "chown -R 1000:1000" in message
    assert str(missing.parent) in message


def test_a_good_path_still_opens(tmp_path):
    conn = open_db(tmp_path / "portal.db")
    assert conn.execute("SELECT 1").fetchone()[0] == 1
    conn.close()
