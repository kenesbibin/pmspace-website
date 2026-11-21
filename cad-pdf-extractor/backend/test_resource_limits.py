"""In-process ASGI tests: no network listener or PM2 restart required."""

import asyncio
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import pymupdf
from starlette.formparsers import MultiPartParser

from backend.main import app
from backend.resource_limits import ResourceLimitError, check_image, check_render, ExtractionAdmission
from backend.service import ExtractionError, build_result

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = (ROOT / "samples/sample_floorplan.pdf").read_bytes()


def pdf(pages):
    with pymupdf.open() as doc:
        for _ in range(pages):
            doc.new_page(width=72, height=72)
        return doc.tobytes()


def multipart(content=SAMPLE, previews="1", password=""):
    boundary = "CADResourceTest"
    body = b""
    for key, value in {"max_preview_pages": previews, "preview_dpi": "72", "password": password}.items():
        body += (f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
    body += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n').encode()
    return body + content + f"\r\n--{boundary}--\r\n".encode(), boundary


class ResourceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.previous_temp = tempfile.tempdir
        self.environment = patch.dict(os.environ, {"CAD_API_TOKEN_FILE": str(ROOT / ".secrets/api-token")})
        self.environment.start()
        self.lifespan = app.router.lifespan_context(app)
        await self.lifespan.__aenter__()
        self.token = (ROOT / ".secrets/api-token").read_bytes().strip()

    async def asyncTearDown(self):
        await self.lifespan.__aexit__(None, None, None)
        tempfile.tempdir = self.previous_temp
        self.environment.stop()

    async def request(self, path="/api/extract", content=SAMPLE, previews="1", password="", token=True, malformed=False):
        body, boundary = multipart(content, previews, password)
        headers = [(b"content-type", f"multipart/form-data; boundary={boundary}".encode())]
        if token:
            headers.append((b"authorization", b"Bearer " + (self.token if token is True else b"wrong")))
        sent = []
        delivered = False

        async def receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                if malformed:
                    return {"type": "http.request", "body": body[:-len(boundary)-10], "more_body": True}
                return {"type": "http.request", "body": body, "more_body": False}
            return {"type": "http.disconnect"}

        async def send(message):
            sent.append(message)

        scope = {"type": "http", "asgi": {"version": "3.0", "spec_version": "2.4"},
                 "http_version": "1.1", "scheme": "http", "method": "GET" if path == "/api/health" else "POST",
                 "path": path, "raw_path": path.encode(), "root_path": "", "query_string": b"",
                 "headers": headers, "server": ("localhost", 18002), "client": ("localhost", 1)}
        await app(scope, receive, send)
        start = next(m for m in sent if m["type"] == "http.response.start")
        response = b"".join(m.get("body", b"") for m in sent if m["type"] == "http.response.body")
        return start["status"], json.loads(response), dict(start["headers"])

    async def test_auth_health_and_sample(self):
        self.assertEqual((await self.request(token=False))[0], 401)
        self.assertEqual((await self.request(token="wrong"))[0], 401)
        self.assertEqual((await self.request(path="/api/health"))[0], 200)
        status, data, _ = await self.request()
        self.assertEqual(status, 200)
        self.assertEqual(data["analysis"]["summary"]["total_rooms"], 4)

    async def test_passwords(self):
        with pymupdf.open(stream=SAMPLE, filetype="pdf") as doc:
            encrypted = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="correct")
        for password in ["", "wrong"]:
            status, data, _ = await self.request(content=encrypted, password=password)
            self.assertEqual(status, 401)
            self.assertEqual(data["code"], "password_required")
        self.assertEqual((await self.request(content=encrypted, password="correct"))[0], 200)

    async def test_page_limits(self):
        self.assertEqual((await self.request(content=pdf(50)))[0], 200)
        status, data, _ = await self.request(content=pdf(51))
        self.assertEqual(status, 413)
        self.assertEqual(data["code"], "resource_limit")

    async def test_preview_limits(self):
        for value in ["0", "11", "-1", "nonsense"]:
            self.assertEqual((await self.request(previews=value))[0], 400)
        self.assertEqual((await self.request(previews="10"))[0], 200)

    async def test_concurrent_and_cancelled_work_retains_slot(self):
        started, release = threading.Event(), threading.Event()

        def slow(*args, **kwargs):
            started.set()
            release.wait(10)
            return {"ok": True}

        with patch("backend.main.build_result", side_effect=slow):
            first = asyncio.create_task(self.request())
            try:
                for _ in range(500):
                    if started.is_set():
                        break
                    await asyncio.sleep(.01)
                self.assertTrue(started.is_set())
                first.cancel()
                await asyncio.sleep(.01)
                status, _, headers = await self.request()
                self.assertEqual(status, 429)
                self.assertEqual(headers[b"retry-after"], b"1")
                self.assertEqual((await self.request(path="/api/health"))[0], 200)
            finally:
                release.set()
                try:
                    await first
                except asyncio.CancelledError:
                    pass
        self.assertEqual((await self.request())[0], 200)

    async def test_busy_rejection_does_not_read_upload(self):
        async def forbidden(*args):
            self.fail("Busy requests must not parse or read uploads")

        sent = []

        async def send(message):
            sent.append(message)

        admission = ExtractionAdmission(forbidden)
        admission.active = True
        await admission({"type": "http", "method": "POST", "path": "/api/extract"}, forbidden, send)
        self.assertEqual(sent[0]["status"], 429)

    async def test_unexpected_error_releases_slot_and_closes_upload(self):
        from starlette.datastructures import UploadFile
        closed = []
        original = UploadFile.close

        async def close(upload):
            await original(upload)
            closed.append(upload.file.closed)

        with patch.object(UploadFile, "close", close), patch("backend.main.build_result", side_effect=RuntimeError("test-only failure")):
            with self.assertRaisesRegex(RuntimeError, "test-only failure"):
                await self.request()
        self.assertTrue(closed)
        self.assertTrue(all(closed))
        self.assertEqual((await self.request())[0], 200)

    async def test_cleanup_and_error_slot_release(self):
        uploads = ROOT / ".runtime/uploads"
        before = set(uploads.iterdir())
        self.assertEqual(uploads.stat().st_mode & 0o777, 0o700)
        # Force spooling even for the tiny sample, without changing dependencies.
        import starlette.formparsers
        original = starlette.formparsers.SpooledTemporaryFile
        handles = []

        def tracked(*args, **kwargs):
            handle = original(*args, **kwargs)
            handles.append(handle)
            return handle

        with patch.object(MultiPartParser, "spool_max_size", 1), patch("starlette.formparsers.SpooledTemporaryFile", side_effect=tracked):
            self.assertEqual((await self.request())[0], 200)
            self.assertEqual((await self.request(content=b"not pdf"))[0], 400)
            self.assertEqual((await self.request(previews="0"))[0], 400)
            self.assertEqual((await self.request(malformed=True))[0], 400)
            self.assertEqual((await self.request())[0], 200)
        self.assertTrue(handles)
        self.assertTrue(all(h.closed for h in handles))
        self.assertEqual(set(uploads.iterdir()), before)

    def test_oversized_pdf(self):
        with self.assertRaises(ExtractionError) as caught:
            build_result(b"%PDF" + b" " * (50 * 1024 * 1024), "large.pdf")
        self.assertIn("larger than", str(caught.exception))

    async def test_oversized_http_upload(self):
        status, _, _ = await self.request(content=b"%PDF" + b" " * (50 * 1024 * 1024))
        self.assertEqual(status, 413)
        self.assertEqual(list((ROOT / ".runtime/uploads").iterdir()), [])
        self.assertEqual((await self.request())[0], 200)

    async def test_render_errors_are_not_swallowed(self):
        for width, height in [(4097, 72), (4001, 4000)]:
            with pymupdf.open() as doc:
                page = doc.new_page(width=width, height=height)
                page.insert_text((10, 20), "KITCHEN")
                content = doc.tobytes()
            status, data, _ = await self.request(content=content)
            self.assertEqual(status, 413)
            self.assertEqual(data["code"], "resource_limit")

    def test_embedded_image_rejected_before_decode(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from extractor import _embedded_page_image
        parent = Mock()
        page = SimpleNamespace(
            rect=SimpleNamespace(width=100, height=100), parent=parent,
            get_images=lambda full: [(1, 0, 4097, 100)],
        )
        with self.assertRaises(ResourceLimitError):
            _embedded_page_image(page)
        parent.extract_image.assert_not_called()

    def test_image_limits_before_render(self):
        check_image(4096, 1)
        check_image(4000, 4000)
        for dims in [(4097, 1), (1, 4097), (4001, 4000), (float("inf"), 1)]:
            with self.assertRaises(ResourceLimitError):
                check_image(*dims)
        with pymupdf.open() as doc:
            page = doc.new_page(width=4097, height=72)
            with self.assertRaises(ResourceLimitError):
                check_render(page, pymupdf.Matrix(1, 1))
