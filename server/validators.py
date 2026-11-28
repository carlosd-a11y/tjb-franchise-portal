"""
Field checks for anything coming from a browser or a bot.

This is the half of firestore.rules that validated shapes. The other half, who
may make which transition, lives beside each route in locations.py.
"""

import re

from errors import ApiError
from model import LIMITS, REASON_CODES, ROLES
from normalize import normalize_address, normalized_address_ok, zip5

EMAIL = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


def clean(value, maximum: int, field: str) -> str:
    if not isinstance(value, str):
        raise ApiError(f"Enter {field}.")
    text = re.sub(r"\s+", " ", value).strip()
    if not text or len(text) > maximum:
        raise ApiError(f"Enter {field}.")
    return text


def whole(value, low: int, high: int, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        raise ApiError(f"Enter {field}.")
    text = str(value).strip()
    if not re.fullmatch(r"\d+", text):
        raise ApiError(f"Enter {field}.")
    number = int(text)
    if number < low or number > high:
        raise ApiError(f"Enter {field}.")
    return number


def address_fields(payload: dict) -> dict:
    address = clean(payload.get("address"), LIMITS["address"], "an address")
    city = clean(payload.get("city"), LIMITS["city"], "a city")
    state = str(payload.get("state") or "").strip().upper()
    code = zip5(str(payload.get("zip") or ""))
    if not re.fullmatch(r"[A-Z]{2}", state):
        raise ApiError("Use a 2-letter state.")
    if not re.fullmatch(r"\d{5}", code):
        raise ApiError("Use a 5-digit ZIP.")
    key = normalize_address(address, city, state, code)
    if not normalized_address_ok(key):
        raise ApiError("That address cannot be saved.")
    return {"address": address, "city": city, "state": state, "zip": code, "normalizedAddress": key}


def geo(payload: dict) -> tuple[float | None, float | None]:
    lat, lng = payload.get("lat"), payload.get("lng")
    if lat is None and lng is None:
        return None, None
    if isinstance(lat, bool) or isinstance(lng, bool):
        raise ApiError("Latitude looks wrong.")
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        raise ApiError("Latitude looks wrong.") from None
    if not -90 <= lat <= 90:
        raise ApiError("Latitude looks wrong.")
    if not -180 <= lng <= 180:
        raise ApiError("Longitude looks wrong.")
    return lat, lng


def draft_location(payload: dict) -> dict:
    fields = address_fields(payload)
    fields["sqft"] = whole(payload.get("sqft"), LIMITS["sqft_min"], LIMITS["sqft_max"], "the square feet")
    fields["rent"] = whole(payload.get("rent"), LIMITS["rent_min"], LIMITS["rent_max"], "the monthly rent")
    fields["lat"], fields["lng"] = geo(payload)
    fields["listingUrl"] = listing_url(payload.get("listingUrl"))
    fields["contactName"] = optional(payload.get("contactName"), LIMITS["name"], "Contact name is too long.")
    fields["contactPhone"] = phone(payload.get("contactPhone"))
    return fields


def optional(value, maximum: int, message: str) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(message)
    text = re.sub(r"\s+", " ", value).strip()
    if len(text) > maximum:
        raise ApiError(message)
    return text or None


def listing_url(value) -> str | None:
    """Only web links: this is rendered as a clickable href."""
    message = "listingUrl must be a web link starting with http:// or https://."
    text = optional(value, 1000, message)
    if text is None:
        return None
    if not re.fullmatch(r"https?://[^\s/?#\\]+[^\s]*", text, re.IGNORECASE):
        raise ApiError(message)
    return text


def phone(value) -> str | None:
    message = "contactPhone does not look like a phone number."
    text = optional(value, 40, message)
    if text is None:
        return None
    if not re.fullmatch(r"[0-9+(). \-]+(?:(?:x|ext\.?) ?[0-9]+)?", text, re.IGNORECASE):
        raise ApiError(message)
    if len(re.sub(r"\D", "", text)) < 7:
        raise ApiError(message)
    return text


def reason(value, field: str = "a short explanation") -> str:
    if not isinstance(value, str):
        raise ApiError(f"Add {field}.")
    text = re.sub(r"\s+", " ", value).strip()
    if len(text) < 3 or len(text) > LIMITS["reason"]:
        raise ApiError(f"Add {field}.")
    return text


def reason_code(value) -> str:
    if value not in REASON_CODES:
        raise ApiError("Pick a reason.")
    return value


def note_text(value) -> str:
    if not isinstance(value, str):
        raise ApiError("Write a note.")
    text = value.strip()
    if not text or len(text) > LIMITS["note"]:
        raise ApiError("Write a note.")
    return text


def role(value) -> str:
    if value not in ROLES:
        raise ApiError("Pick a role.")
    return value


def email(value) -> str:
    text = str(value or "").strip().lower()
    if not EMAIL.fullmatch(text) or len(text) > LIMITS["email"]:
        raise ApiError("Enter a valid email address.")
    return text


def uid(value) -> str:
    text = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", text):
        raise ApiError("That user id does not look right.")
    return text
