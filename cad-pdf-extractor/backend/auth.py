"""CAD-only authentication, applied before request bodies are consumed."""

import secrets
from pathlib import Path

from starlette.responses import JSONResponse


def load_token(filename):
    """Reject absent, unreadable, empty, or malformed secret files."""
    try:
        token = Path(filename).read_bytes().strip() if filename else b""
    except (OSError, ValueError):
        raise RuntimeError("CAD authentication secret is unavailable.") from None
    if not token or any(c <= 32 or c >= 127 for c in token):
        raise RuntimeError("CAD authentication secret is missing or invalid.")
    return token


class BearerAuth:
    def __init__(self, app, token_provider):
        self.app = app
        self.token_provider = token_provider

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = [v for k, v in scope.get("headers", []) if k.lower() == b"authorization"]
        expected = self.token_provider()
        valid = False
        if expected and len(headers) == 1:
            scheme, separator, supplied = headers[0].partition(b" ")
            if scheme.lower() == b"bearer" and separator and supplied:
                valid = secrets.compare_digest(supplied, expected)
        if not valid:
            response = JSONResponse(
                {"error": "Unauthorized", "code": "unauthorized"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            return await response(scope, receive, send)
        return await self.app(scope, receive, send)
