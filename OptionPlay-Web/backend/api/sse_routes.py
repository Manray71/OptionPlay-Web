"""SSE (Server-Sent Events) endpoint for real-time market data streaming."""

import asyncio
import json
import logging

from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from ..services.market_data_cache import get_snapshot, get_version

logger = logging.getLogger("optionplay.sse")

router = APIRouter()


@router.get("/stream")
async def stream(request: Request):
    """SSE stream of real-time market data.

    Events:
        snapshot — full data on initial connection
        update   — full data when cache changes
        heartbeat — keepalive every ~30s
    """
    return EventSourceResponse(
        _event_generator(request),
        media_type="text/event-stream",
    )


async def _event_generator(request: Request):
    """Async generator that yields SSE events."""
    # Send initial snapshot
    snapshot = get_snapshot()
    yield {
        "event": "snapshot",
        "data": json.dumps(snapshot, default=str),
    }
    last_version = snapshot["version"]

    heartbeat_counter = 0

    while True:
        # Check if client disconnected
        if await request.is_disconnected():
            logger.debug("SSE client disconnected")
            break

        # Check for cache updates
        current_version = get_version()
        if current_version > last_version:
            snapshot = get_snapshot()
            yield {
                "event": "update",
                "data": json.dumps(snapshot, default=str),
            }
            last_version = current_version
            heartbeat_counter = 0

        # Heartbeat every ~30s (15 iterations * 2s sleep)
        heartbeat_counter += 1
        if heartbeat_counter >= 15:
            yield {
                "event": "heartbeat",
                "data": "",
            }
            heartbeat_counter = 0

        await asyncio.sleep(2)
