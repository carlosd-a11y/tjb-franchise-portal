"""The address key must agree with src/lib/normalize.ts, vector for vector."""

import json
from pathlib import Path

import pytest

from normalize import normalize_address, normalized_address_ok, zip5

VECTORS = json.loads(
    (Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "address-vectors.json").read_text()
)


@pytest.mark.parametrize("vector", VECTORS, ids=[v["id"] for v in VECTORS])
def test_matches_the_shared_vectors(vector):
    assert (
        normalize_address(vector["address"], vector["city"], vector["state"], vector["zip"])
        == vector["normalized"]
    )


def test_a_different_street_in_one_zip_stays_different():
    first = normalize_address("100 Main St", "Miami", "FL", "33139")
    second = normalize_address("200 Main St", "Miami", "FL", "33139")
    assert first != second


def test_zip5_takes_the_first_five_digits():
    assert zip5("33139-1234") == "33139"
    assert zip5("nope") == ""


def test_the_key_shape_is_checked():
    assert normalized_address_ok("100 main street|miami|fl|33139")
    assert not normalized_address_ok("")
    assert not normalized_address_ok("Has Capitals|miami|fl|33139")
