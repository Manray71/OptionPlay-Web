"""SSE (Server-Sent Events) endpoint for real-time market data streaming.

Uses a pure ASGI callable (scope, receive, send) mounted via Starlette Mount
to avoid Python 3.14 + anyio compatibility issues and the None-response crash
that occurs when a Route endpoint doesn't return a Response object.
"""

import asyncio
import json
import logging

from ..services.market_data_cache import get_snapshot, get_version

logger = logging.getLogger("optionplay.sse")


def _format_sse(event: str, data: str) -> bytes:
    return f"event: {event}\ndata: {data}\n\n".encode("utf-8")


async def stream_asgi_app(scope, receive, send):
    """Pure ASGI SSE handler — no anyio dependency, no Starlette Response wrapper."""
    if scope["type"] != "http":
        return

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

    snapshot = get_snapshot()
    await send({
        "type": "http.response.body",
        "body": _format_sse("snapshot", json.dumps(snapshot, default=str)),
        "more_body": True,
    })
    last_version = snapshot["version"]
    heartbeat_counter = 0

    while True:
        disconnected = False
        try:
            msg = await asyncio.wait_for(receive(), timeout=0.01)
            if msg.get("type") == "http.disconnect":
                logger.debug("SSE client disconnected")
                disconnected = True
        except asyncio.TimeoutError:
            pass
        except Exception:
            disconnected = True
        if disconnected:
            break

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

    try:
        await send({"type": "http.response.body", "body": b"", "more_body": False})
    except Exception:
        pass
