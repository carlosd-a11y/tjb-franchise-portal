"""
Rows out as the shapes src/types.ts already describes.

Timestamps leave as ISO-8601 strings. The browser wraps them so the pages keep
calling .toDate(), exactly as they did with Firestore and with the demo store.
"""

from db import is_stale
from model import ACTIVE_CLAIM_STATUSES, CLAIM_WINDOW_DAYS


def sees_contact(row, viewer: dict) -> bool:
    """Admins, and whoever holds a live or approved claim on the site."""
    if viewer["role"] == "admin":
        return True
    if row["claimed_by"] != viewer["uid"]:
        return False
    if row["status"] == "approved":
        return True
    return row["status"] in ACTIVE_CLAIM_STATUSES and not is_stale(row["last_activity_at"], CLAIM_WINDOW_DAYS)


def location(row, viewer: dict) -> dict:
    visible = sees_contact(row, viewer)
    has_contact = bool(row["contact_name"] or row["contact_phone"])
    return {
        "listingUrl": row["listing_url"],
        # Withheld here, not just hidden on screen: it never leaves the server.
        "contactName": row["contact_name"] if visible else None,
        "contactPhone": row["contact_phone"] if visible else None,
        "contactHidden": has_contact and not visible,
        "id": row["id"],
        "address": row["address"],
        "city": row["city"],
        "state": row["state"],
        "zip": row["zip"],
        "normalizedAddress": row["normalized_address"],
        "lat": row["lat"],
        "lng": row["lng"],
        "sqft": row["sqft"],
        "rent": row["rent"],
        "source": row["source"],
        "status": row["status"],
        "claimedBy": row["claimed_by"],
        "claimedByName": row["claimed_by_name"],
        "claimedAt": row["claimed_at"],
        "lastActivityAt": row["last_activity_at"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "passReason": row["pass_reason"],
    }


def note(row) -> dict:
    return {
        "id": row["id"],
        "text": row["text"],
        "authorUid": row["author_uid"],
        "authorName": row["author_name"],
        "createdAt": row["created_at"],
    }


def history(row) -> dict:
    return {
        "id": row["id"],
        "fromStatus": row["from_status"],
        "toStatus": row["to_status"],
        "actorUid": row["actor_uid"],
        "actorName": row["actor_name"],
        "reason": row["reason"],
        "createdAt": row["created_at"],
    }


def rejection(row) -> dict:
    return {
        "id": row["id"],
        "address": row["address"],
        "city": row["city"],
        "state": row["state"],
        "zip": row["zip"],
        "normalizedAddress": row["normalized_address"],
        "rejectedBy": row["rejected_by"],
        "rejectedAt": row["rejected_at"],
        "reasonCode": row["reason_code"],
        "reasonText": row["reason_text"],
    }


def user(row) -> dict:
    return {
        "uid": row["uid"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "active": bool(row["active"]),
    }


def invite(row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "status": row["status"],
        "expiresAt": row["expires_at"] if "expires_at" in row.keys() else None,
        "acceptedAt": row["accepted_at"] if "accepted_at" in row.keys() else None,
    }


def scout(row) -> dict:
    """The key is deliberately absent. It is shown once, when it is made."""
    return {
        "id": row["id"],
        "name": row["name"],
        "label": row["label"],
        "active": bool(row["active"]),
        "createdBy": row["created_by"],
        "createdAt": row["created_at"],
        "lastSeenAt": row["last_seen_at"],
        "submitted": row["submitted"],
    }
