"""
The invitation flow.

An admin invites someone, they set their own password with Firebase, and the
link turns that Firebase account into a portal account. The token and the
signed-in address must agree, or nothing is written.
"""

import mail
from conftest import auth
from db import open_db


def invite(client, token, email="new@example.test", name="New Person", role="franchisee"):
    return client.post(
        "/api/invites",
        json={"email": email, "name": name, "role": role},
        headers=auth(token),
    )


def link_token(response) -> str:
    return response.get_json()["link"].rsplit("/", 1)[1]


def test_admin_gets_a_link_even_when_email_is_not_set_up(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    response = invite(client, make_token("avery"))
    body = response.get_json()
    assert response.status_code == 201
    assert body["emailed"] is False
    assert "problem" in body
    assert body["link"].endswith(link_token(response))


def test_the_email_carries_the_link(client, seed, make_token, monkeypatch, app):
    sent = {}
    monkeypatch.setenv("PORTAL_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("PORTAL_SMTP_USER", "portal@tropicaljuicebar.test")
    monkeypatch.setenv("PORTAL_SMTP_PASSWORD", "secret")
    monkeypatch.setattr(mail, "_smtp", lambda message, config: sent.update(
        to=message["To"], body=message.get_content(), sender=message["From"]
    ))
    response = invite(client, make_token("avery"))
    assert response.get_json()["emailed"] is True
    assert sent["to"] == "new@example.test"
    assert response.get_json()["link"] in sent["body"]
    assert "tropicaljuicebar.test" in sent["sender"]


def test_a_mail_failure_does_not_lose_the_invite(client, seed, make_token, monkeypatch):
    monkeypatch.setenv("PORTAL_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("PORTAL_SMTP_USER", "portal@tropicaljuicebar.test")
    monkeypatch.setenv("PORTAL_SMTP_PASSWORD", "secret")

    def explode(message, config):
        raise OSError("connection refused")

    monkeypatch.setattr(mail, "_smtp", explode)
    response = invite(client, make_token("avery"))
    assert response.status_code == 201
    assert response.get_json()["emailed"] is False
    # Still usable: the link in the reply works.
    assert client.get(f"/api/invites/accept/{link_token(response)}").status_code == 200


def test_only_the_hash_of_the_token_is_stored(client, seed, make_token, app, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    with app.app_context():
        from db import get_db

        row = get_db().execute("SELECT token_hash FROM invites").fetchone()
    assert token not in row["token_hash"]
    assert len(row["token_hash"]) == 64


def test_the_page_can_read_the_invite_without_signing_in(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    body = client.get(f"/api/invites/accept/{token}").get_json()
    assert body == {"email": "new@example.test", "name": "New Person"}


def test_a_made_up_token_says_nothing(client, seed):
    assert client.get("/api/invites/accept/not-a-real-token-value-here").status_code == 404


def test_accepting_creates_the_account_with_the_invited_role(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery"), role="admin"))
    fresh = make_token("firebase-uid-1", second_factor=False, email="new@example.test")

    assert client.get("/api/locations", headers=auth(fresh)).status_code == 403
    assert client.post("/api/invites/accept", json={"token": token}, headers=auth(fresh)).status_code == 200
    assert client.get("/api/locations", headers=auth(fresh)).status_code == 200

    users = client.get("/api/users", headers=auth(fresh)).get_json()["users"]
    mine = [u for u in users if u["uid"] == "firebase-uid-1"][0]
    assert mine == {
        "uid": "firebase-uid-1",
        "email": "new@example.test",
        "name": "New Person",
        "role": "admin",
        "active": True,
    }


def test_a_different_address_cannot_use_the_link(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    intruder = make_token("someone-else", second_factor=False, email="intruder@example.test")
    response = client.post("/api/invites/accept", json={"token": token}, headers=auth(intruder))
    assert response.status_code == 403
    assert client.get("/api/locations", headers=auth(intruder)).status_code == 403


def test_a_token_without_an_address_claim_is_refused(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    anonymous = make_token("no-email-uid", second_factor=False)
    assert client.post("/api/invites/accept", json={"token": token}, headers=auth(anonymous)).status_code == 403


def test_the_link_cannot_be_used_twice(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    fresh = make_token("firebase-uid-1", second_factor=False, email="new@example.test")
    assert client.post("/api/invites/accept", json={"token": token}, headers=auth(fresh)).status_code == 200

    other = make_token("firebase-uid-2", second_factor=False, email="new@example.test")
    assert client.post("/api/invites/accept", json={"token": token}, headers=auth(other)).status_code == 404
    assert client.get("/api/locations", headers=auth(other)).status_code == 403


def test_an_expired_link_is_refused(client, seed, make_token, app, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    with app.app_context():
        from conftest import days_ago
        from db import get_db

        get_db().execute("UPDATE invites SET expires_at = ?", (days_ago(1),))

    assert client.get(f"/api/invites/accept/{token}").status_code == 410
    fresh = make_token("firebase-uid-1", second_factor=False, email="new@example.test")
    assert client.post("/api/invites/accept", json={"token": token}, headers=auth(fresh)).status_code == 410


def test_resending_replaces_the_old_link(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    first = link_token(invite(client, make_token("avery")))
    again = client.post("/api/invites/new@example.test/resend", headers=auth(make_token("avery")))
    second = link_token(again)

    assert second != first
    assert client.get(f"/api/invites/accept/{first}").status_code == 404
    assert client.get(f"/api/invites/accept/{second}").status_code == 200


def test_invites_are_still_admin_only(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    alex = auth(make_token("alex"))
    assert client.post("/api/invites", json={"email": "x@example.test", "name": "X", "role": "franchisee"}, headers=alex).status_code == 403
    assert client.post("/api/invites/x@example.test/resend", headers=alex).status_code == 403
    assert client.delete("/api/invites/x@example.test", headers=alex).status_code == 403


def test_an_admin_can_withdraw_an_invite(client, seed, make_token, monkeypatch):
    monkeypatch.delenv("PORTAL_SMTP_HOST", raising=False)
    token = link_token(invite(client, make_token("avery")))
    assert client.delete("/api/invites/new@example.test", headers=auth(make_token("avery"))).status_code == 200
    assert client.get(f"/api/invites/accept/{token}").status_code == 404
