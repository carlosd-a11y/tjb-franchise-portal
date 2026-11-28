"""Listing link and contact: who sends them, and who may see the contact."""

import sqlite3

import pytest

from conftest import add_location, auth, days_ago
from db import init_db

EXTRAS = {
    "listing_url": "https://example.test/listing/1",
    "contact_name": "Pat Broker",
    "contact_phone": "(973) 555-0100",
}
BODY = {"address": "9 Link Rd", "city": "Newark", "state": "NJ", "zip": "07102", "sqft": 1200, "rent": 4500}


def seeded(app, **claim):
    location_id = add_location(app, **claim)
    from db import get_db

    with app.app_context():
        get_db().execute(
            "UPDATE locations SET listing_url = ?, contact_name = ?, contact_phone = ? WHERE id = ?",
            (*EXTRAS.values(), location_id),
        )
    return location_id


def views(client, make_token, uid, location_id):
    headers = auth(make_token(uid))
    one = client.get(f"/api/locations/{location_id}", headers=headers).get_json()["location"]
    listed = client.get("/api/locations", headers=headers).get_json()["locations"][0]
    return one, listed


def claimed(status="claimed", age=1):
    return dict(status=status, claimed_by="alex", claimed_by_name="Alex Rivera",
                claimed_at=days_ago(age), last_activity_at=days_ago(age))


def assert_sees(client, make_token, uid, location_id, expected):
    for view in views(client, make_token, uid, location_id):
        assert view["listingUrl"] == EXTRAS["listing_url"]
        assert view["contactName"] == ("Pat Broker" if expected else None)
        assert view["contactPhone"] == ("(973) 555-0100" if expected else None)
        assert view["contactHidden"] is (not expected)


def test_pool_contact_is_for_admins_only(app, client, seed, make_token):
    location_id = seeded(app)
    assert_sees(client, make_token, "avery", location_id, True)
    assert_sees(client, make_token, "alex", location_id, False)


@pytest.mark.parametrize("claim,expected", [
    (claimed(), True),
    (claimed("approved", 90), True),
    (claimed("rejected"), False),
    (claimed(age=40), False),
])
def test_what_the_claimer_sees(app, client, seed, make_token, claim, expected):
    location_id = seeded(app, **claim)
    assert_sees(client, make_token, "alex", location_id, expected)
    assert_sees(client, make_token, "jordan", location_id, False)


def test_claiming_reveals_and_passing_hides(app, client, seed, make_token):
    location_id = seeded(app)
    headers = auth(make_token("jordan"))
    client.post(f"/api/locations/{location_id}/claim", headers=headers, json={})
    assert_sees(client, make_token, "jordan", location_id, True)
    client.post(f"/api/locations/{location_id}/pass", headers=headers, json={"reason": "Too small"})
    assert_sees(client, make_token, "jordan", location_id, False)


def test_a_scout_can_send_them(client, seed, scout, make_token):
    body = {**BODY, "listingUrl": "https://example.test/a?id=2", "contactName": "Sam", "contactPhone": "973-555-0101 ext. 4"}
    response = client.post("/api/intake", json=body, headers=auth(scout))
    assert response.status_code == 201
    one, _ = views(client, make_token, "avery", response.get_json()["id"])
    assert (one["listingUrl"], one["contactName"], one["contactPhone"]) == (
        "https://example.test/a?id=2", "Sam", "973-555-0101 ext. 4")


def test_they_are_optional_and_work_from_the_form(client, seed, make_token):
    headers = auth(make_token("alex"))
    response = client.post("/api/locations", headers=headers, json={**BODY, "listingUrl": "", "contactName": None})
    assert response.status_code == 201
    one, _ = views(client, make_token, "avery", response.get_json()["id"])
    assert one["listingUrl"] is None and one["contactName"] is None and one["contactHidden"] is False


@pytest.mark.parametrize("bad", [
    {"listingUrl": "javascript:alert(1)"},
    {"listingUrl": "data:text/html,x"},
    {"listingUrl": "example.test/no-scheme"},
    {"listingUrl": "https://"},
    {"contactPhone": "call me"},
    {"contactPhone": "123"},
    {"contactName": "x" * 81},
])
def test_bad_values_are_refused(client, seed, scout, bad):
    assert client.post("/api/intake", json={**BODY, **bad}, headers=auth(scout)).status_code == 400


def test_an_existing_database_gains_the_columns_and_keeps_rows(app, tmp_path):
    from pathlib import Path

    schema = (Path(__file__).resolve().parents[1] / "schema.sql").read_text()
    old = schema.replace(
        "  pass_reason        TEXT,\n  listing_url        TEXT,\n  contact_name       TEXT,\n  contact_phone      TEXT\n",
        "  pass_reason        TEXT\n")
    assert old != schema
    conn = sqlite3.connect(tmp_path / "old.db")
    conn.executescript(old)
    conn.execute("INSERT INTO users VALUES ('u', 'u@example.test', 'U', 'admin', 1)")
    init_db(conn)
    init_db(conn)
    columns = {row[1] for row in conn.execute("PRAGMA table_info(locations)")}
    assert {"listing_url", "contact_name", "contact_phone"} <= columns
    assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 1
