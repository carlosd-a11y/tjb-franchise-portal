#!/usr/bin/env python3
"""
Turn a pasted Firebase config block into .env.production.

The console shows the config as a JavaScript snippet with a copy button, so the
whole thing can be pasted in one go rather than retyped field by field. This
reads the six values out of it.

    python3 read_firebase_config.py <paste >/dev/null

Writes .env.production in the current directory. These are public client keys
that ship inside the built JavaScript; the file is git-ignored all the same, so
that nobody commits something that is not.
"""

import re
import sys

EXPECTED_PROJECT = "tjb-franchise-portal"

FIELDS = {
    "apiKey": "VITE_FIREBASE_API_KEY",
    "authDomain": "VITE_FIREBASE_AUTH_DOMAIN",
    "projectId": "VITE_FIREBASE_PROJECT_ID",
    "storageBucket": "VITE_FIREBASE_STORAGE_BUCKET",
    "messagingSenderId": "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "appId": "VITE_FIREBASE_APP_ID",
}

TAIL = ["", "VITE_USE_EMULATORS=false", "VITE_BACKEND=server", "VITE_REQUIRE_TOTP=false"]


def parse(text: str) -> dict:
    found = {}
    for key, name in FIELDS.items():
        match = re.search(key + r"""\s*:\s*["']([^"']+)["']""", text)
        if match:
            found[name] = match.group(1).strip()
    return found


def main() -> None:
    found = parse(sys.stdin.read())

    missing = [name for name in FIELDS.values() if name not in found]
    if missing:
        print("That paste is missing: " + ", ".join(missing), file=sys.stderr)
        print("Copy the whole config block, braces and all.", file=sys.stderr)
        raise SystemExit(1)

    project = found["VITE_FIREBASE_PROJECT_ID"]
    if project != EXPECTED_PROJECT:
        print(f"That config is for project '{project}', not '{EXPECTED_PROJECT}'.", file=sys.stderr)
        print("Pick the Franchise portal app in the right project.", file=sys.stderr)
        raise SystemExit(1)

    lines = [f"{name}={found[name]}" for name in FIELDS.values()] + TAIL
    with open(".env.production", "w") as handle:
        handle.write("\n".join(lines) + "\n")
    print("Read all six values.")


if __name__ == "__main__":
    main()
