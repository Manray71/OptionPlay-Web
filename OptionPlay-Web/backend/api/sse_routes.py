"""SSE (Server-Sent Events) endpoint for real-time market data streaming.

Uses a plain Starlette Route with a raw ASGI handler to avoid
Python 3.14 + anyio compatibility issues.
"""

import asyncio
import json
import logging

from starlette.requests import Request
from starlette.routing import Route

from ..services.market_data_cache import get_snapshot, get_version

logger = logging.getLogger("optionplay.sse")


def _format_sse(event: str, data: str) -> bytes:
    """Format a single SSE message as bytes."""
    return f"event: {event}\ndata: {data}\n\n".encode("utf-8")


async def _stream_handler(request: Request):
    """Raw ASGI SSE handler — no anyio dependency."""
    send = request._send
    receive = request._receive

    # Send headers
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [
            [b"content-type", b"text/event-stream; charset=utf-8"],
            [b"cache-control", b"no-cache"],
            [b"connection", b"keep-alive"],
            [b"x-accel-buffering", b"no"],
            [b"access-control-allow-origin", b"*"],
        ],
    })

    # Send initial snapshot
    snapshot = get_snapshot()
    await send({
        "type": "http.response.body",
        "body": _format_sse("snapshot", json.dumps(snapshot, default=str)),
        "more_body": True,
    })
    last_version = snapshot["version"]
    heartbeat_counter = 0

    # Stream loop
    while True:
        # Check for client disconnect (non-blocking)
        disconnected = False
        try:
            coro = receive()
            msg = await asyncio.wait_for(coro, timeout=0.01)
            if msg.get("type") == "http.disconnect":
                logger.debug("SSE client disconnected")
                disconnected = True
        except asyncio.TimeoutError:
            pass
        except Exception:
            disconnected = True
        if disconnected:
            break

        # Check for cache updates
        current_version = get_version()
        if current_version > last_version:
            snapshot = get_snapshot()
            try:
                await send({
                    "type": "http.response.body",
                    "body": _format_sse("update", json.dumps(snapshot, default=str)),
                    "more_body": True,
                })
            except Exception:
                break
            last_version = current_version
            heartbeat_counter = 0

        # Heartbeat every ~30s
        heartbeat_counter += 1
        if heartbeat_counter >= 15:
            try:
                await send({
                    "type": "http.response.body",
                    "body": _format_sse("heartbeat", ""),
                    "more_body": True,
                })
            except Exception:
                break
            heartbeat_counter = 0

        await asyncio.sleep(2)

    # Close
    try:
        await send({
            "type": "http.response.body",
            "body": b"",
            "more_body": False,
        })
    except Exception:
        pass


# Expose as a Starlette Route (not a FastAPI router)
# Must be mounted via app.routes.append() or app.mount()
sse_route = Route("/stream", _stream_handler)
