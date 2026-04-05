"""Authentication and input validation dependencies for FastAPI."""

import os
import re

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

# ── Admin API Key Authentication ──

_header_scheme = APIKeyHeader(name="X-Admin-Key", auto_error=False)


async def require_admin_key(api_key: str = Security(_header_scheme)) -> str:
    """FastAPI dependency: validates the admin API key from X-Admin-Key header.

    Fail-closed: if OPTIONPLAY_ADMIN_KEY is not configured, returns 500.
    """
    expected = os.environ.get("OPTIONPLAY_ADMIN_KEY", "")
    if not expected:
        raise HTTPException(
            status_code=500,
            detail="OPTIONPLAY_ADMIN_KEY not configured on server",
        )
    if not api_key or api_key != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing admin key")
    return api_key


# ── Symbol Input Validation ──

_SYMBOL_RE = re.compile(r"^[A-Z]{1,6}([.\-][A-Z]{1,2})?$")


def validate_symbol(symbol: str) -> str:
    """Validate and normalize a stock ticker symbol.

    Matches OptionPlay backend's validation pattern.
    """
    if not symbol or not isinstance(symbol, str):
        raise HTTPException(status_code=400, detail="Symbol is required")
    normalized = symbol.strip().upper()
    if len(normalized) > 10:
        raise HTTPException(
            status_code=400, detail=f"Symbol too long: {normalized[:20]}"
        )
    if not _SYMBOL_RE.match(normalized):
        raise HTTPException(status_code=400, detail=f"Invalid symbol: {normalized}")
    return normalized
