"""Authentication tests without optional HTTP client dependencies."""

import tempfile
import unittest
from pathlib import Path

from backend.auth import BearerAuth, load_token
from backend.main import app


class AuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def request(self, headers, expected=b"test-token"):
        called = []
        messages = []

        async def endpoint(scope, receive, send):
            called.append(True)
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})

        async def receive():
            raise AssertionError("Authentication must not consume the upload")

        async def send(message):
            messages.append(message)

        await BearerAuth(endpoint, lambda: expected)(
            {"type": "http", "method": "POST", "path": "/api/extract", "headers": headers},
            receive, send,
        )
        return messages[0]["status"], called

    async def test_valid_token(self):
        status, called = await self.request([(b"authorization", b"Bearer test-token")])
        self.assertEqual(status, 200)
        self.assertTrue(called)

    async def test_missing_invalid_and_duplicate_tokens(self):
        for headers in [[], [(b"authorization", b"Bearer wrong")],
                        [(b"authorization", b"Basic test-token")],
                        [(b"authorization", b"Bearer test-token")] * 2]:
            status, called = await self.request(headers)
            self.assertEqual(status, 401)
            self.assertFalse(called)

    async def test_unconfigured_middleware_fails_closed(self):
        status, called = await self.request([(b"authorization", b"Bearer test-token")], None)
        self.assertEqual(status, 401)
        self.assertFalse(called)

    def test_secret_validation(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1] / ".venv/tmp") as directory:
            path = Path(directory) / "token"
            for filename in [None, str(path)]:
                with self.assertRaises(RuntimeError):
                    load_token(filename)
            path.write_bytes(b"\n")
            with self.assertRaises(RuntimeError):
                load_token(path)
            path.write_bytes(b"test-token\n")
            self.assertEqual(load_token(path), b"test-token")

    async def test_application_startup_requires_secret(self):
        from unittest.mock import patch
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaises(RuntimeError):
                async with app.router.lifespan_context(app):
                    self.fail("Startup must fail without a configured secret")
