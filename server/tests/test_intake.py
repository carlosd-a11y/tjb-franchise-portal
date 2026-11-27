"""
Bot intake, ported from tests/intake.test.php.

Same contract as the PHP endpoint it replaces: a key per bot, 409 on an address
already listed, warnings when the address or ZIP was rejected before, and a
rate limit.
"""

from conftest import add_location, auth

BODY = {"address": "100 Demo Harbor Dr", "city": "Miami", "state": "FL", "zip": "33139", "sqft": 1450, "rent": 8200}


def send(client, body=None, key=None):
    return client.post("/api/intake", json=body if body is not None else BODY,
                       headers={"Authorization": f"Bearer {key}"})


def test_a_good_post_creates_a_pool_row_from_that_bot(client, seed, scout, make_token):
    response = send(client, key=scout)
    assert response.status_code == 201
    body = response.get_json()
    assert body["ok"] is True
    row = client.get(f"/api/locations/{body['id']}", headers=auth(make_token("alex"))).get_json()["location"]
    assert row["status"] == "pool"
    assert row["source"] == "bot:muse"
    assert row["createdBy"] == "bot:muse"


def test_an_unknown_key_is_refused(client, seed, scout):
    assert send(client, key="wrong-key-wrong-key-wrong").status_code == 401


def test_no_key_is_refused(client, seed, scout):
    assert client.post("/api/intake", json=BODY).status_code == 401


def test_an_unknown_field_is_refused(client, seed, scout):
    response = send(client, {**BODY, "status": "approved"}, key=scout)
    assert response.status_code == 400
    assert "Unknown field" in response.get_json()["error"]


def test_a_bad_field_is_refused(client, seed, scout):
    assert send(client, {**BODY, "zip": "331"}, key=scout).status_code == 400
    assert send(client, {**BODY, "sqft": 0}, key=scout).status_code == 400
    assert send(client, {**BODY, "lat": 500, "lng": 0}, key=scout).status_code == 400


def test_the_same_address_returns_409_and_does_not_write(client, seed, scout):
    first = send(client, key=scout)
    assert first.status_code == 201
    again = send(client, {**BODY, "address": "100 Demo Harbor Drive"}, key=scout)
    assert again.status_code == 409
    body = again.get_json()
    assert body["error"] == "duplicate"
    assert body["id"] == first.get_json()["id"]


def test_a_rejected_address_still_writes_but_warns(app, client, seed, scout, make_token):
    location_id = add_location(app, normalized_address="100 demo harbor drive|miami|fl|33139")
    client.post(
        f"/api/locations/{location_id}/reject",
        headers=auth(make_token("avery")),
        json={"reasonCode": "rent", "reasonText": "Too expensive"},
    )
    client.delete(f"/api/locations/{location_id}", headers=auth(make_token("avery")))

    response = send(client, key=scout)
    assert response.status_code == 201
    warnings = response.get_json()["rejectionWarnings"]
    assert [warning["match"] for warning in warnings] == ["address"]
    assert warnings[0]["reasonCode"] == "rent"


def test_a_different_street_in_the_same_zip_warns_on_the_zip(app, client, seed, scout, make_token):
    location_id = add_location(app, normalized_address="900 other road|miami|fl|33139")
    client.post(
        f"/api/locations/{location_id}/reject",
        headers=auth(make_token("avery")),
        json={"reasonCode": "traffic", "reasonText": "No footfall"},
    )
    client.delete(f"/api/locations/{location_id}", headers=auth(make_token("avery")))

    warnings = send(client, key=scout).get_json()["rejectionWarnings"]
    assert [warning["match"] for warning in warnings] == ["zip"]


def test_the_rate_limit_stops_a_flood(client, seed, scout):
    seen_429 = False
    for index in range(70):
        response = send(client, {**BODY, "address": f"{index} Flood St"}, key=scout)
        if response.status_code == 429:
            seen_429 = True
            break
    assert seen_429
