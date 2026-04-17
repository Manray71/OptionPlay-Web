"""Tests for the in-memory market data cache."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

import pytest
from backend.services.market_data_cache import (
    get_cache,
    get_snapshot,
    get_version,
    update_cache,
    set_poll_status,
)


@pytest.fixture(autouse=True)
def reset_cache():
    """Reset cache state before each test."""
    import backend.services.market_data_cache as mod
    mod._cache.clear()
    mod._version = 0
    mod._last_poll_ok = False
    yield


class TestMarketDataCache:
    """Unit tests for market_data_cache module."""

    def test_initial_cache_empty(self):
        """All keys return None initially."""
        assert get_cache("vix") is None
        assert get_cache("quotes") is None
        assert get_cache("positions") is None
        assert get_cache("summary") is None

    def test_initial_version_zero(self):
        """Version starts at 0."""
        assert get_version() == 0

    @pytest.mark.asyncio
    async def test_update_and_read(self):
        """Write data, read it back."""
        await update_cache("vix", {"vix": 18.5, "regime": "Normal"})

        data = get_cache("vix")
        assert data is not None
        assert data["vix"] == 18.5
        assert data["regime"] == "Normal"

    @pytest.mark.asyncio
    async def test_version_increments(self):
        """Version bumps on each update."""
        assert get_version() == 0
        await update_cache("vix", {"vix": 18.5})
        assert get_version() == 1
        await update_cache("quotes", {"quotes": []})
        assert get_version() == 2

    @pytest.mark.asyncio
    async def test_snapshot_includes_all_keys(self):
        """Snapshot has expected structure."""
        await update_cache("vix", {"vix": 20.0})

        snapshot = get_snapshot()
        assert "version" in snapshot
        assert "timestamp" in snapshot
        assert "market_session" in snapshot
        assert "polling_active" in snapshot
        assert "vix" in snapshot
        assert "quotes" in snapshot
        assert "positions" in snapshot
        assert "summary" in snapshot
        assert snapshot["vix"]["vix"] == 20.0

    @pytest.mark.asyncio
    async def test_snapshot_null_for_missing_keys(self):
        """Snapshot returns None for unpopulated keys."""
        snapshot = get_snapshot()
        assert snapshot["vix"] is None
        assert snapshot["quotes"] is None
        assert snapshot["positions"] is None

    def test_set_poll_status(self):
        """Poll status is reflected in snapshot."""
        snapshot = get_snapshot()
        assert snapshot["polling_active"] is False

        set_poll_status(True)
        snapshot = get_snapshot()
        assert snapshot["polling_active"] is True

    @pytest.mark.asyncio
    async def test_update_overwrites(self):
        """Second update overwrites first."""
        await update_cache("vix", {"vix": 18.0})
        await update_cache("vix", {"vix": 22.0})

        data = get_cache("vix")
        assert data["vix"] == 22.0
