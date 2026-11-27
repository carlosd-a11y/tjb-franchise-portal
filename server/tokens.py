"""
Firebase ID token verification.

The browser signs in to Firebase and sends the resulting token. Nothing here
issues or stores a password: this only checks that Google signed the token, that
it was minted for this project, and that it has not expired.

Google's public keys are published as x509 certificates and rotate; they are
cached until the Cache-Control max-age they come with.
"""

import re
import time

import jwt
import requests
from cryptography.x509 import load_pem_x509_certificate

CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"


class TokenError(Exception):
    """The token is missing, malformed, expired or not ours."""


class GoogleKeys:
    """Caches Google's signing certificates, refreshing when they expire."""

    def __init__(self, url: str = CERT_URL) -> None:
        self.url = url
        self._keys: dict[str, object] = {}
        self._expires_at = 0.0

    def _refresh(self) -> None:
        response = requests.get(self.url, timeout=10)
        response.raise_for_status()
        self._keys = {
            kid: load_pem_x509_certificate(pem.encode()).public_key()
            for kid, pem in response.json().items()
        }
        max_age = 3600
        match = re.search(r"max-age=(\d+)", response.headers.get("Cache-Control", ""))
        if match:
            max_age = int(match.group(1))
        self._expires_at = time.time() + max_age

    def get(self, kid: str):
        if kid not in self._keys or time.time() >= self._expires_at:
            self._refresh()
        if kid not in self._keys:
            raise TokenError("Unknown signing key.")
        return self._keys[kid]


def verify(token: str, project_id: str, keys: GoogleKeys, require_second_factor: bool = False) -> dict:
    """
    Returns the token's claims, or raises TokenError.

    When require_second_factor is on, a token that did not pass an authenticator
    app is refused. Firestore rules could not do this; the server can, which is
    why the authenticator app now protects the data and not only the sign-in
    screen. Confirm the claim on a real token before turning this on.
    """
    if not token:
        raise TokenError("No token.")
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as error:
        raise TokenError("Malformed token.") from error

    kid = header.get("kid")
    if not kid:
        raise TokenError("Token has no key id.")

    try:
        claims = jwt.decode(
            token,
            key=keys.get(kid),
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError as error:
        raise TokenError("Token rejected.") from error

    uid = claims.get("sub")
    if not isinstance(uid, str) or not uid or len(uid) > 128:
        raise TokenError("Token has no usable subject.")

    if require_second_factor:
        firebase = claims.get("firebase") or {}
        if not firebase.get("sign_in_second_factor"):
            raise TokenError("This account must sign in with its authenticator app.")

    return claims
