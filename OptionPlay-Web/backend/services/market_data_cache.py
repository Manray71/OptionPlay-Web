"""In-memory cache for real-time market data.

Module-level singleton. Updated by the polling loop, read by the SSE endpoint.
Each entry stores data + updated_at timestamp. A monotonic version counter
lets SSE clients skip duplicate sends.
"""

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from .ibkr_helpers import _us_market_session

_cache: Dict[str, Dict[str, Any]] = {}
_version: int = 0
_lock = asyncio.Lock()
_last_poll_ok: bool = False


def get_cache(key: str) -> Optional[Dict[str, Any]]:
    """Get cached data for a key, or None."""
    entry = _cache.get(key)
    if entry:
        return entry.get("data")
    return None


def get_version() -> int:
    """Current cache version (monotonic counter)."""
    return _version


def get_snapshot() -> Dict[str, Any]:
    """Full snapshot of all cached data + metadata."""
    session = _us_market_session()
    return {
        "version": _version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "market_session": session,
        "polling_active": _last_poll_ok,
        "poll_interval": get_poll_interval(),
        "vix": _cache.get("vix", {}).get("data"),
        "quotes": _cache.get("quotes", {}).get("data"),
        "positions": _cache.get("positions", {}).get("data"),
        "summary": _cache.get("summary", {}).get("data"),
    }


async def update_cache(key: str, data: Any) -> None:
    """Update a cache entry and bump the version."""
    global _version
    async with _lock:
        _cache[key] = {
            "data": data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _version += 1


def set_poll_status(ok: bool) -> None:
    """Set whether the last poll cycle succeeded."""
    global _last_poll_ok
    _last_poll_ok = ok


def get_poll_interval() -> int:
    """Return poll interval in seconds based on market session.

    Returns 0 for closed (polling paused).
    """
    session = _us_market_session()
    if session == "market_open":
        return 8
    if session in ("pre_market", "post_market"):
        return 30
    return 0  # closed
