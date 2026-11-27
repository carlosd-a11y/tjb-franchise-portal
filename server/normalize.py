"""
Canonical address key for dedupe and rejection matching.

A faithful port of src/lib/normalize.ts. The two must agree: the same vectors
in tests/fixtures/address-vectors.json are checked on both sides, because a
drift here silently splits one real address into two rows and loses the
"rejected before" warning.
"""

import re

# Street-suffix tokens and the spelled-out form they share. Street line only.
SUFFIXES = {
    "st": "street", "street": "street",
    "ave": "avenue", "avenue": "avenue",
    "rd": "road", "road": "road",
    "blvd": "boulevard", "boulevard": "boulevard",
    "dr": "drive", "drive": "drive",
    "ln": "lane", "lane": "lane",
    "ct": "court", "court": "court",
    "pl": "place", "place": "place",
    "pkwy": "parkway", "parkway": "parkway",
    "hwy": "highway", "highway": "highway",
    "rte": "route", "route": "route",
}

DIRECTIONS = {
    "n": "north", "s": "south", "e": "east", "w": "west",
    "ne": "northeast", "nw": "northwest", "se": "southeast", "sw": "southwest",
    "north": "north", "south": "south", "east": "east", "west": "west",
    "northeast": "northeast", "northwest": "northwest",
    "southeast": "southeast", "southwest": "southwest",
}

WORD_ORDINALS = {
    "first": "1", "second": "2", "third": "3", "fourth": "4", "fifth": "5",
    "sixth": "6", "seventh": "7", "eighth": "8", "ninth": "9", "tenth": "10",
}

_ORDINAL = re.compile(r"^(\d+)(st|nd|rd|th)$")
_UNIT_RUN = re.compile(r"\b(apt|apartment|unit|suite|ste)(?:\s+(?:apt|apartment|unit|suite|ste))+\b")
_UNIT = re.compile(r"\b(?:apt|apartment|unit|suite|ste)\s+[a-z0-9]+\b")
_ZIP5 = re.compile(r"\d{5}")


def _scrub(value: str) -> str:
    text = value.strip().lower().replace("&", " and ")
    text = re.sub(r"\bu\s*\.\s*s\s*\.?", " us ", text)
    text = re.sub(r"\bn\s*\.\s*e\s*\.?", " northeast ", text)
    text = re.sub(r"\bn\s*\.\s*w\s*\.?", " northwest ", text)
    text = re.sub(r"\bs\s*\.\s*e\s*\.?", " southeast ", text)
    text = re.sub(r"\bs\s*\.\s*w\s*\.?", " southwest ", text)
    text = text.replace("#", " unit ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _strip_units(value: str) -> str:
    text = value
    previous = ""
    while text != previous:
        previous = text
        text = _UNIT_RUN.sub(r"\1", text)
        text = _UNIT.sub(" ", text)
        text = re.sub(r"\s+", " ", text).strip()
    return text


def _rewrite_token(token: str, street: bool) -> str:
    numeric = _ORDINAL.match(token)
    if numeric:
        return numeric.group(1)
    if token in WORD_ORDINALS:
        return WORD_ORDINALS[token]
    if token in DIRECTIONS:
        return DIRECTIONS[token]
    if street and token in SUFFIXES:
        return SUFFIXES[token]
    return token


def _rewrite(value: str, street: bool) -> str:
    text = _scrub(value)
    if street:
        text = re.sub(r"\bu s\b", "us", _strip_units(text))
    return " ".join(_rewrite_token(token, street) for token in text.split(" ") if token)


def zip5(value: str) -> str:
    match = _ZIP5.search(value.strip())
    return match.group(0) if match else ""


def normalize_address(address: str, city: str, state: str, zip_code: str) -> str:
    """
    The street line folds suffixes, directions, units and ordinals. The city
    folds directions and punctuation only, so "St. Pete" stays "st pete"
    instead of becoming "street pete". ZIP warnings use the 5-digit ZIP, which
    is separate from this key.
    """
    state_key = re.sub(r"[^a-z]", "", state.lower())
    return "|".join([_rewrite(address, True), _rewrite(city, False), state_key, zip5(zip_code)])


def normalized_address_ok(value: str) -> bool:
    return 1 <= len(value) <= 300 and re.fullmatch(r"[a-z0-9| -]+", value) is not None
