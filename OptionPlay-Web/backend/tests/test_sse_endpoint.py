"""Tests for the SSE infrastructure (cache + endpoint registration)."""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from backend.services import market_data_cache


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset cache state before each test."""
    market_data_cache._cache.clear()
    market_data_cache._version = 0
    market_data_cache._last_poll_ok = False
    yield


# Note: SSE streaming endpoint cannot be tested via httpx sync client
# (EventSourceResponse + ASGITransport causes weakref errors on Python 3.14).
# Test manually: curl -N http://localhost:8000/api/json/stream


@pytest.mark.asyncio
async def test_cache_feeds_snapshot():
    """Verify cache snapshot format matches what SSE would send."""
    await market_data_cache.update_cache("vix", {
        "vix": 22.3,
        "regime": "Elevated",
        "change": 1.2,
    })
    await market_data_cache.update_cache("quotes", {
        "quotes": [{"symbol": "SPY", "price": 605.0}],
        "market_open": True,
    })

    snapshot = market_data_cache.get_snapshot()

    # Structure checks
    assert snapshot["version"] == 2
    assert snapshot["vix"]["vix"] == 22.3
    assert snapshot["vix"]["regime"] == "Elevated"
    assert snapshot["quotes"]["quotes"][0]["symbol"] == "SPY"
    assert snapshot["positions"] is None  # Not populated
    assert "timestamp" in snapshot
    assert "market_session" in snapshot


@pytest.mark.asyncio
async def test_version_tracks_changes():
    """SSE only sends updates when version changes."""
    v0 = market_data_cache.get_version()
    assert v0 == 0

    await market_data_cache.update_cache("vix", {"vix": 18.0})
    v1 = market_data_cache.get_version()
    assert v1 == 1

    # Reading doesn't change version
    market_data_cache.get_snapshot()
    assert market_data_cache.get_version() == 1

    # Another update bumps version
    await market_data_cache.update_cache("vix", {"vix": 18.5})
    assert market_data_cache.get_version() == 2
