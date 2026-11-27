"""
Registering a scouting platform from the page.

This is what replaced editing a key list on the server and restarting it.
"""

from conftest import auth


def add(client, token, name="grokbot", label="Grokbot"):
    return client.post("/api/scouts", headers=auth(token), json={"name": name, "label": label})


def test_only_an_admin_manages_scouts(client, seed, make_token):
    assert client.get("/api/scouts", headers=auth(make_token("alex"))).status_code == 403
    assert add(client, make_token("alex")).status_code == 403
    assert client.get("/api/scouts", headers=auth(make_token("avery"))).status_code == 200


def test_adding_a_scout_returns_its_key_once(client, seed, make_token):
    token = make_token("avery")
    response = add(client, token)
    assert response.status_code == 201
    body = response.get_json()
    assert len(body["key"]) >= 32
    assert body["scout"]["name"] == "grokbot"
    assert body["scout"]["active"] is True
    assert body["scout"]["submitted"] == 0

    # The key is never handed out again.
    listed = client.get("/api/scouts", headers=auth(token)).get_json()["scouts"]
    assert [scout["name"] for scout in listed] == ["grokbot"]
    assert "key" not in listed[0]


def test_the_key_itself_is_not_stored(app, client, seed, make_token):
    key = add(client, make_token("avery")).get_json()["key"]
    with app.app_context():
        from db import get_db

        rows = get_db().execute("SELECT * FROM scouts").fetchall()
    assert key not in [row["key_hash"] for row in rows]
    assert len(rows[0]["key_hash"]) == 64


def test_a_short_name_must_be_a_slug_and_unique(client, seed, make_token):
    token = make_token("avery")
    assert add(client, token, name="Grok Bot").status_code == 400
    assert add(client, token, name="").status_code == 400
    assert add(client, token, label="").status_code == 400
    assert add(client, token).status_code == 201
    assert add(client, token).status_code == 409


def test_a_new_scout_can_post_and_its_finds_are_tagged(client, seed, make_token):
    token = make_token("avery")
    key = add(client, token, name="muse", label="Muse").get_json()["key"]
    body = {"address": "500 Scout Way", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": 1200, "rent": 5000}
    response = client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {key}"})
    assert response.status_code == 201

    location_id = response.get_json()["id"]
    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["location"]
    assert row["source"] == "bot:muse"

    listed = client.get("/api/scouts", headers=auth(token)).get_json()["scouts"][0]
    assert listed["submitted"] == 1
    assert listed["lastSeenAt"] is not None


def test_pausing_a_scout_stops_it_posting(client, seed, make_token):
    token = make_token("avery")
    created = add(client, token, name="muse", label="Muse").get_json()
    key, scout_id = created["key"], created["scout"]["id"]
    body = {"address": "600 Scout Way", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": 1200, "rent": 5000}

    assert client.patch(f"/api/scouts/{scout_id}", headers=auth(token), json={"active": False}).status_code == 200
    paused = client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {key}"})
    assert paused.status_code == 401

    assert client.patch(f"/api/scouts/{scout_id}", headers=auth(token), json={"active": True}).status_code == 200
    assert client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {key}"}).status_code == 201


def test_rotating_a_key_retires_the_old_one(client, seed, make_token):
    token = make_token("avery")
    created = add(client, token, name="muse", label="Muse").get_json()
    old_key, scout_id = created["key"], created["scout"]["id"]

    new_key = client.post(f"/api/scouts/{scout_id}/rotate", headers=auth(token)).get_json()["key"]
    assert new_key != old_key

    body = {"address": "700 Scout Way", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": 1200, "rent": 5000}
    assert client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {old_key}"}).status_code == 401
    assert client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {new_key}"}).status_code == 201


def test_removing_a_scout_keeps_what_it_already_found(client, seed, make_token):
    token = make_token("avery")
    created = add(client, token, name="muse", label="Muse").get_json()
    key, scout_id = created["key"], created["scout"]["id"]
    body = {"address": "800 Scout Way", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": 1200, "rent": 5000}
    location_id = client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {key}"}).get_json()["id"]

    assert client.delete(f"/api/scouts/{scout_id}", headers=auth(token)).status_code == 200
    assert client.post("/api/intake", json=body, headers={"Authorization": f"Bearer {key}"}).status_code == 401

    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["location"]
    assert row["source"] == "bot:muse"


def test_a_duplicate_find_still_counts_as_contact(client, seed, make_token):
    token = make_token("avery")
    key = add(client, token, name="muse", label="Muse").get_json()["key"]
    body = {"address": "900 Scout Way", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": 1200, "rent": 5000}
    headers = {"Authorization": f"Bearer {key}"}
    assert client.post("/api/intake", json=body, headers=headers).status_code == 201
    assert client.post("/api/intake", json=body, headers=headers).status_code == 409

    listed = client.get("/api/scouts", headers=auth(token)).get_json()["scouts"][0]
    assert listed["submitted"] == 1  # the duplicate did not create a second site
