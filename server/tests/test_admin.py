"""Users, invites and the CSV import, which are admin only."""

from conftest import auth


def test_only_an_admin_lists_users(client, seed, make_token):
    assert client.get("/api/users", headers=auth(make_token("alex"))).status_code == 403
    body = client.get("/api/users", headers=auth(make_token("avery"))).get_json()
    assert [user["uid"] for user in body["users"]] == ["alex", "avery", "jordan", "sam"]


def test_an_admin_adds_a_user(client, seed, make_token):
    response = client.put(
        "/api/users/newperson",
        headers=auth(make_token("avery")),
        json={"email": "new@example.test", "name": "New Person", "role": "franchisee", "active": True},
    )
    assert response.status_code == 200
    assert client.get("/api/me", headers=auth(make_token("newperson"))).get_json()["name"] == "New Person"


def test_an_admin_cannot_remove_their_own_access(client, seed, make_token):
    for change in [
        {"email": "avery@example.test", "name": "Avery Admin", "role": "franchisee", "active": True},
        {"email": "avery@example.test", "name": "Avery Admin", "role": "admin", "active": False},
    ]:
        response = client.put("/api/users/avery", headers=auth(make_token("avery")), json=change)
        assert response.status_code == 409


def test_invites_are_admin_only_and_grant_nothing(client, seed, make_token):
    assert client.get("/api/invites", headers=auth(make_token("alex"))).status_code == 403
    created = client.post(
        "/api/invites",
        headers=auth(make_token("avery")),
        json={"email": "Someone@Example.test", "name": "Someone", "role": "franchisee"},
    )
    assert created.status_code == 201
    invites = client.get("/api/invites", headers=auth(make_token("avery"))).get_json()["invites"]
    assert invites[0]["id"] == "someone@example.test"
    assert invites[0]["status"] == "pending"
    # The invite is a checklist entry. It does not create an account.
    assert client.get("/api/me", headers=auth(make_token("someone"))).status_code == 403


def test_the_csv_import_is_admin_only_and_checks_every_row(client, seed, make_token):
    rows = [
        {
            "address": "1 Fake Palm Ave", "city": "Miami", "state": "FL", "zip": "33139",
            "rejectedBy": "Avery Admin", "rejectedAt": "2026-01-01T00:00:00Z",
            "reasonCode": "rent", "reasonText": "FAKE too expensive",
        }
    ]
    assert client.post(
        "/api/rejections/import", headers=auth(make_token("alex")), json={"rows": rows}
    ).status_code == 403

    response = client.post("/api/rejections/import", headers=auth(make_token("avery")), json={"rows": rows})
    assert response.status_code == 201
    assert response.get_json()["imported"] == 1

    bad = [{**rows[0], "reasonCode": "nonsense"}]
    failed = client.post("/api/rejections/import", headers=auth(make_token("avery")), json={"rows": bad})
    assert failed.status_code == 400
    assert "Row 1" in failed.get_json()["error"]
    # The whole import is refused, so nothing from the bad file landed.
    assert len(client.get("/api/rejections", headers=auth(make_token("alex"))).get_json()["rejections"]) == 1
