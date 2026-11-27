"""One shape for every refusal, so the client can show the sentence as written."""

from flask import jsonify


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, **extra) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


def handle(error: ApiError):
    return jsonify({"error": error.message, **error.extra}), error.status
