"""
The permission matrix, ported case by case from tests/rules/firestore.rules.test.ts.

Each test names the allow line it replaces.
"""

from conftest import add_location, auth, days_ago


def post(client, token, path, body=None):
    return client.post(path, headers=auth(token), json=body or {})


# ── Claiming ──────────────────────────────────────────────────────────────────

def test_a_pool_row_can_be_claimed(app, client, seed, make_token):
    location_id = add_location(app)
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/claim").status_code == 200
    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()
    assert row["location"]["status"] == "claimed"
    assert row["location"]["claimedByName"] == "Alex Rivera"
    assert [item["toStatus"] for item in row["history"]] == ["claimed"]


def test_a_fresh_claim_cannot_be_taken(app, client, seed, make_token):
    location_id = add_location(
        app, status="claimed", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(2), last_activity_at=days_ago(2),
    )
    response = post(client, make_token("jordan"), f"/api/locations/{location_id}/claim")
    assert response.status_code == 409
    assert "already claimed" in response.get_json()["error"]


def test_a_stale_claim_can_be_taken(app, client, seed, make_token):
    location_id = add_location(
        app, status="researching", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(40), last_activity_at=days_ago(40),
    )
    assert post(client, make_token("jordan"), f"/api/locations/{location_id}/claim").status_code == 200


def test_an_approved_row_cannot_be_claimed(app, client, seed, make_token):
    location_id = add_location(app, status="approved", last_activity_at=days_ago(90))
    assert post(client, make_token("jordan"), f"/api/locations/{location_id}/claim").status_code == 409


def test_the_owner_cannot_claim_twice(app, client, seed, make_token):
    location_id = add_location(
        app, status="claimed", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(1), last_activity_at=days_ago(1),
    )
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/claim").status_code == 409


# ── Moving forward, keeping, passing ──────────────────────────────────────────

def test_the_owner_advances_and_an_outsider_cannot(app, client, seed, make_token):
    location_id = add_location(
        app, status="claimed", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(1), last_activity_at=days_ago(1),
    )
    assert post(client, make_token("jordan"), f"/api/locations/{location_id}/advance").status_code == 403
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/advance").status_code == 200
    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()
    assert row["location"]["status"] == "researching"


def test_keep_refreshes_the_clock_and_nothing_else(app, client, seed, make_token):
    location_id = add_location(
        app, status="touring", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(20), last_activity_at=days_ago(20),
    )
    before = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/keep").status_code == 200
    after = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()
    assert after["location"]["lastActivityAt"] > before["location"]["lastActivityAt"]
    assert after["location"]["status"] == "touring"
    assert after["history"] == []


def test_passing_needs_a_reason_and_returns_it_to_the_pool(app, client, seed, make_token):
    location_id = add_location(
        app, status="touring", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(3), last_activity_at=days_ago(3),
    )
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/pass", {"reason": "no"}).status_code == 400
    assert post(
        client, make_token("alex"), f"/api/locations/{location_id}/pass", {"reason": "Rent too high"}
    ).status_code == 200
    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()
    assert row["location"]["status"] == "pool"
    assert row["location"]["claimedBy"] is None
    assert row["location"]["passReason"] == "Rent too high"
    assert row["history"][-1]["reason"] == "Rent too high"


def test_a_franchisee_cannot_pass_someone_elses_claim(app, client, seed, make_token):
    location_id = add_location(
        app, status="claimed", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(1), last_activity_at=days_ago(1),
    )
    response = post(client, make_token("jordan"), f"/api/locations/{location_id}/pass", {"reason": "Not for me"})
    assert response.status_code == 403


# ── Admin only ────────────────────────────────────────────────────────────────

def test_only_an_admin_approves_a_submitted_row(app, client, seed, make_token):
    location_id = add_location(
        app, status="submitted", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(5), last_activity_at=days_ago(5),
    )
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/approve").status_code == 403
    assert post(client, make_token("avery"), f"/api/locations/{location_id}/approve").status_code == 200


def test_only_an_admin_rejects_and_it_writes_a_rejection(app, client, seed, make_token):
    location_id = add_location(app, normalized_address="100 main street|miami|fl|33139")
    assert post(
        client, make_token("alex"), f"/api/locations/{location_id}/reject",
        {"reasonCode": "rent", "reasonText": "Too expensive"},
    ).status_code == 403
    assert post(
        client, make_token("avery"), f"/api/locations/{location_id}/reject",
        {"reasonCode": "rent", "reasonText": "Too expensive"},
    ).status_code == 200
    rejections = client.get("/api/rejections", headers=auth(make_token("alex"))).get_json()["rejections"]
    assert len(rejections) == 1
    assert rejections[0]["reasonCode"] == "rent"
    assert rejections[0]["rejectedBy"] == "Avery Admin"


def test_rejecting_without_a_reason_is_refused(app, client, seed, make_token):
    location_id = add_location(app)
    assert post(
        client, make_token("avery"), f"/api/locations/{location_id}/reject",
        {"reasonCode": "rent", "reasonText": ""},
    ).status_code == 400
    assert post(
        client, make_token("avery"), f"/api/locations/{location_id}/reject",
        {"reasonCode": "nonsense", "reasonText": "Too expensive"},
    ).status_code == 400


def test_only_an_admin_deletes(app, client, seed, make_token):
    location_id = add_location(app)
    assert client.delete(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).status_code == 403
    assert client.delete(f"/api/locations/{location_id}", headers=auth(make_token("avery"))).status_code == 200
    assert client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).status_code == 404


# ── Address edits ─────────────────────────────────────────────────────────────

def fixed():
    return {"address": "101 Demo Harbor Dr", "city": "Miami", "state": "FL", "zip": "33139"}


def test_a_franchisee_cannot_edit_an_address_and_an_admin_can(app, client, seed, make_token):
    location_id = add_location(app)
    assert client.patch(
        f"/api/locations/{location_id}/address", headers=auth(make_token("alex")), json=fixed()
    ).status_code == 403
    assert client.patch(
        f"/api/locations/{location_id}/address", headers=auth(make_token("avery")), json=fixed()
    ).status_code == 200


def test_an_address_edit_keeps_the_claim_and_the_clock(app, client, seed, make_token):
    location_id = add_location(
        app, status="claimed", claimed_by="alex", claimed_by_name="Alex Rivera",
        claimed_at=days_ago(4), last_activity_at=days_ago(4),
    )
    before = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["location"]
    client.patch(f"/api/locations/{location_id}/address", headers=auth(make_token("avery")), json=fixed())
    after = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["location"]
    assert after["address"] == "101 Demo Harbor Dr"
    assert after["status"] == "claimed"
    assert after["claimedBy"] == "alex"
    assert after["lastActivityAt"] == before["lastActivityAt"]


def test_a_bad_address_edit_is_refused(app, client, seed, make_token):
    location_id = add_location(app)
    token = make_token("avery")
    for bad in [
        {**fixed(), "zip": "3313"},
        {**fixed(), "state": "Florida"},
        {**fixed(), "address": " "},
    ]:
        assert client.patch(
            f"/api/locations/{location_id}/address", headers=auth(token), json=bad
        ).status_code == 400


def test_an_address_edit_cannot_duplicate_another_row(app, client, seed, make_token):
    first = add_location(app, normalized_address="100 main street|miami|fl|33139")
    add_location(app, normalized_address="101 demo harbor drive|miami|fl|33139")
    response = client.patch(
        f"/api/locations/{first}/address", headers=auth(make_token("avery")), json=fixed()
    )
    assert response.status_code == 409
    assert "already in the list" in response.get_json()["error"]


def test_a_rejected_rows_address_is_frozen(app, client, seed, make_token):
    location_id = add_location(app, status="rejected")
    response = client.patch(
        f"/api/locations/{location_id}/address", headers=auth(make_token("avery")), json=fixed()
    )
    assert response.status_code == 409
    assert "can't be changed" in response.get_json()["error"]


# ── Notes ─────────────────────────────────────────────────────────────────────

def test_anyone_active_adds_a_note_and_only_the_author_edits_it(app, client, seed, make_token):
    location_id = add_location(app)
    assert post(client, make_token("alex"), f"/api/locations/{location_id}/notes", {"text": "Visited"}).status_code == 201
    notes = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["notes"]
    note_id = notes[0]["id"]
    assert client.patch(
        f"/api/locations/{location_id}/notes/{note_id}", headers=auth(make_token("jordan")), json={"text": "No"}
    ).status_code == 403
    assert client.patch(
        f"/api/locations/{location_id}/notes/{note_id}", headers=auth(make_token("alex")), json={"text": "Edited"}
    ).status_code == 200


# ── Creating ──────────────────────────────────────────────────────────────────

def test_a_new_location_lands_in_the_pool(app, client, seed, make_token):
    body = {"address": "900 New Rd", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": "1200", "rent": "5000"}
    response = post(client, make_token("alex"), "/api/locations", body)
    assert response.status_code == 201
    location_id = response.get_json()["id"]
    row = client.get(f"/api/locations/{location_id}", headers=auth(make_token("alex"))).get_json()["location"]
    assert row["status"] == "pool"
    assert row["source"] == "manual"
    assert row["createdBy"] == "alex"
    assert row["claimedBy"] is None


def test_the_same_address_cannot_be_added_twice(app, client, seed, make_token):
    body = {"address": "900 New Rd", "city": "Tampa", "state": "FL", "zip": "33602", "sqft": "1200", "rent": "5000"}
    assert post(client, make_token("alex"), "/api/locations", body).status_code == 201
    again = {**body, "address": "900 New Road"}
    response = post(client, make_token("jordan"), "/api/locations", again)
    assert response.status_code == 409
