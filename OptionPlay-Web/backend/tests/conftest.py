"""Shared test fixtures for backend tests.

Note: Python 3.14 + nest_asyncio + anyio is broken (current_task() returns None
in nested event loops). We use httpx.AsyncClient with ASGITransport.
For endpoints that trigger anyio internally (e.g. FastAPI Depends with Security),
we run async tests via pytest-asyncio.
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import asyncio

# Ensure event loop exists before nest_asyncio is applied by routes.py import
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

import pytest
import httpx

from backend.main import app


@pytest.fixture
def client():
    """Simple sync test client for endpoints that don't use anyio internals."""

    class _Client:
        def _run(self, method, url, **kwargs):
            async def _req():
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(
                    transport=transport, base_url="http://test"
                ) as ac:
                    return await getattr(ac, method)(url, **kwargs)

            return asyncio.get_event_loop().run_until_complete(_req())

        def get(self, url, **kwargs):
            return self._run("get", url, **kwargs)

        def post(self, url, **kwargs):
            return self._run("post", url, **kwargs)

    return _Client()


@pytest.fixture
def async_client():
    """Async httpx client for pytest-asyncio tests."""

    async def _make():
        transport = httpx.ASGITransport(app=app)
        return httpx.AsyncClient(transport=transport, base_url="http://test")

    return _make
