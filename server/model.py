"""Shared constants. Keep in step with src/lib/model.ts."""

CLAIM_WINDOW_DAYS = 30
LOCATION_LIST_LIMIT = 300

STATUSES = ["pool", "claimed", "researching", "touring", "submitted", "approved", "rejected"]
ACTIVE_CLAIM_STATUSES = ["claimed", "researching", "touring", "submitted"]
NEXT_STATUS = {"claimed": "researching", "researching": "touring", "touring": "submitted"}

REASON_CODES = [
    "rent", "traffic", "competition", "size", "zoning",
    "parking", "visibility", "landlord", "demographics", "other",
]

ROLES = ["admin", "franchisee"]

LIMITS = {
    "address": 200,
    "city": 80,
    "name": 80,
    "email": 120,
    "note": 2000,
    "reason": 500,
    "rejected_by": 120,
    "normalized": 300,
    "sqft_min": 1,
    "sqft_max": 1_000_000,
    "rent_min": 0,
    "rent_max": 10_000_000,
}

# A rejected row keeps the address its rejections record copied, so the
# "rejected before" warning keeps matching it.
REJECTED_ADDRESS_LOCKED = "A rejected location's address can't be changed."
