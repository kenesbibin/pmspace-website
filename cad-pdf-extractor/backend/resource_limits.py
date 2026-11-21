"""CAD resource guards; admission is process-local (one worker only)."""

import math
import asyncio
import os
import tempfile
from pathlib import Path

import anyio
import pymupdf
from starlette.responses import JSONResponse


class ResourceLimitError(ValueError):
    pass


async def run_extraction(function):
    """Also withstand direct asyncio cancellation until the thread finishes."""
    task = asyncio.create_task(anyio.to_thread.run_sync(function, abandon_on_cancel=False))
    cancelled = False
    while True:
        try:
            result = await asyncio.shield(task)
        except asyncio.CancelledError:
            cancelled = True
            if task.cancelled():
                raise
            continue
        except BaseException:
            if cancelled:
                raise asyncio.CancelledError from None
            raise
        if cancelled:
            raise asyncio.CancelledError
        return result


def check_image(width, height):
    if (not math.isfinite(width) or not math.isfinite(height)
            or width <= 0 or height <= 0 or width > 4096 or height > 4096
            or math.ceil(width) * math.ceil(height) > 16_000_000):
        raise ResourceLimitError("Image exceeds the 4096-axis or 16-million-pixel limit.")


def check_render(page, matrix):
    # Integer bounding-box rounding matches the raster allocation bounds.
    rect = page.rect
    x0, y0 = getattr(rect, "x0", 0), getattr(rect, "y0", 0)
    bounds = (pymupdf.Rect(x0, y0, x0 + rect.width, y0 + rect.height) * matrix).irect
    check_image(bounds.width, bounds.height)


def check_pages(document):
    if document.page_count > 50:
        raise ResourceLimitError("PDF exceeds the 50-page limit.")
    # Inspect PDF image metadata before text dictionaries or rasterization can
    # decode embedded images, including images outside the chosen preview pages.
    for page in document:
        for image in page.get_images(full=True):
            check_image(image[2], image[3])


def prepare_upload_storage():
    root = Path(__file__).resolve().parents[1] / ".runtime"
    uploads = root / "uploads"
    for path in (root, uploads):
        if path.is_symlink():
            raise RuntimeError("CAD temporary storage must not be a symlink.")
        path.mkdir(mode=0o700, exist_ok=True)
        if path.stat().st_uid != os.getuid():
            raise RuntimeError("CAD temporary storage has an unexpected owner.")
        path.chmod(0o700)
    # Process-local setting; does not alter other applications or environments.
    tempfile.tempdir = str(uploads)


class ExtractionAdmission:
    def __init__(self, app):
        self.app = app
        self.active = False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or scope.get("path", "").rstrip("/") != "/api/extract":
            return await self.app(scope, receive, send)
        # No await between check and assignment: atomic on the worker event loop.
        if self.active:
            return await JSONResponse(
                {"error": "An extraction is already active.", "code": "extraction_busy"},
                status_code=429, headers={"Retry-After": "1"},
            )(scope, receive, send)
        self.active = True
        try:
            # Preserve ownership until parsing, background work, and cleanup finish.
            with anyio.CancelScope(shield=True):
                await self.app(scope, receive, send)
        finally:
            self.active = False
