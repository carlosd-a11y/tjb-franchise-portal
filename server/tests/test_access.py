"""
A valid Firebase login grants nothing on its own.

These are the "access" cases from tests/rules/firestore.rules.test.ts: an
anonymous visitor, a user with no account here, and a user who was turned off.
"""

from conftest import auth


def test_no_token_is_refused(client, seed):
    assert client.get("/api/locations").status_code == 401


def test_a_token_this_project_did_not_issue_is_refused(client, seed, make_token):
    other = make_token("alex", aud="someone-elses-project")
    assert client.get("/api/locations", headers=auth(other)).status_code == 401


def test_a_token_signed_by_an_unknown_key_is_refused(client, seed):
    assert client.get("/api/locations", headers=auth("not.a.token")).status_code == 401


def test_a_user_with_no_account_here_is_refused(client, seed, make_token):
    response = client.get("/api/locations", headers=auth(make_token("stranger")))
    assert response.status_code == 403
    assert "no access" in response.get_json()["error"]


def test_an_inactive_user_is_refused(client, seed, make_token):
    response = client.get("/api/locations", headers=auth(make_token("sam")))
    assert response.status_code == 403
    assert "turned off" in response.get_json()["error"]


def test_an_active_user_may_read(client, seed, make_token):
    response = client.get("/api/locations", headers=auth(make_token("alex")))
    assert response.status_code == 200
    assert response.get_json()["locations"] == []


def test_me_returns_the_profile(client, seed, make_token):
    body = client.get("/api/me", headers=auth(make_token("avery"))).get_json()
    assert body == {
        "uid": "avery",
        "email": "avery@example.test",
        "name": "Avery Admin",
        "role": "admin",
        "active": True,
    }


def test_the_authenticator_app_can_be_required(app, seed, make_token):
    app.config["REQUIRE_SECOND_FACTOR"] = True
    client = app.test_client()
    without = make_token("alex", second_factor=False)
    assert client.get("/api/locations", headers=auth(without)).status_code == 401
    with_factor = make_token("alex", second_factor=True)
    assert client.get("/api/locations", headers=auth(with_factor)).status_code == 200
