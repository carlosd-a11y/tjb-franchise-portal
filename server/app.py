"""
The application.

Serves the built React app and the API from one place, which is what removes
the second hosting target. Traefik terminates TLS in front of it, as it already
does for the other service on this box.
"""

import os
from pathlib import Path

from flask import Flask, jsonify, send_from_directory

import admin
import intake
import invites
import locations
import pages
import scouts
from db import close_db, get_db, init_db, open_db
from errors import ApiError, handle
from tokens import GoogleKeys

DIST = Path(__file__).parent.parent / "dist"


def create_app(**overrides) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        FIREBASE_PROJECT_ID=os.environ.get("PORTAL_FIREBASE_PROJECT_ID", ""),
        REQUIRE_SECOND_FACTOR=os.environ.get("PORTAL_REQUIRE_TOTP", "") == "true",
        BASE_URL=os.environ.get("PORTAL_BASE_URL", "https://franchise.tropicaljuicebar.com"),
        GOOGLE_KEYS=GoogleKeys(),
        DIST=DIST,
    )
    app.config.update(overrides)

    if not app.config["FIREBASE_PROJECT_ID"]:
        app.logger.warning("PORTAL_FIREBASE_PROJECT_ID is not set; every signed-in request will be refused.")

    app.register_blueprint(locations.bp)
    app.register_blueprint(admin.bp)
    app.register_blueprint(invites.bp)
    app.register_blueprint(pages.bp)
    app.register_blueprint(scouts.bp)
    app.register_blueprint(intake.bp)
    app.register_error_handler(ApiError, handle)
    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db(get_db())

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def spa(path: str):
        """Anything that is not the API falls through to index.html."""
        root = app.config["DIST"]
        if path and (root / path).is_file():
            return send_from_directory(root, path)
        if not (root / "index.html").is_file():
            return jsonify({"error": "The site has not been built yet. Run npm run build."}), 503
        return send_from_directory(root, "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    init_db(open_db())
    app.run(host="127.0.0.1", port=5005, debug=True)
