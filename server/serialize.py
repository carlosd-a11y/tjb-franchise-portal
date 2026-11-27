"""
Rows out as the shapes src/types.ts already describes.

Timestamps leave as ISO-8601 strings. The browser wraps them so the pages keep
calling .toDate(), exactly as they did with Firestore and with the demo store.
"""


def location(row) -> dict:
    return {
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
    }
