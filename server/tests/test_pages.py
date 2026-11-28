"""The criteria page: private, admin-written."""

from conftest import auth

URL = "/api/pages/site-criteria"


def test_signed_out_people_get_nothing(client, seed):
    assert client.get(URL).status_code == 401


def test_an_admin_writes_and_a_franchisee_reads(client, seed, make_token):
    assert client.get(URL, headers=auth(make_token("alex"))).get_json()["body"] == ""
    for text in ("## Space\n- first", "## Space\n- second"):
        assert client.put(URL, headers=auth(make_token("avery")), json={"body": text}).status_code == 200
    assert client.get(URL, headers=auth(make_token("alex"))).get_json()["body"] == "## Space\n- second"


def test_only_an_admin_writes(client, seed, make_token):
    assert client.put(URL, headers=auth(make_token("alex")), json={"body": "x"}).status_code == 403


def test_bad_input_is_refused(client, seed, make_token):
    headers = auth(make_token("avery"))
    assert client.put(URL, headers=headers, json={"body": "x" * 20001}).status_code == 400
    assert client.put(URL, headers=headers, json={}).status_code == 400
    assert client.get("/api/pages/other", headers=headers).status_code == 404
