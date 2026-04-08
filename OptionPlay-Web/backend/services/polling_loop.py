"""Background polling loop that fetches IBKR data and updates the cache.

Runs as an asyncio background task, started via FastAPI lifespan.
Polls sequentially (IBKR allows only one connection per clientId).
"""

import asyncio
import logging
from datetime import datetime, timezone

from .ibkr_helpers import (
    _db_last_vix,
    _fetch_ibkr_portfolio,
    _fetch_ibkr_quotes,
    _is_us_market_open,
    _us_market_session,
    _vix_regime,
)
from .market_data_cache import get_poll_interval, set_poll_status, update_cache

logger = logging.getLogger("optionplay.sse.polling")

# Market symbols to poll (matches Dashboard.jsx MARKET_SYMBOLS)
MARKET_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM", "VIX"]


async def start_polling():
    """Main polling loop — runs forever until cancelled."""
    logger.info("SSE polling loop started")

    while True:
        interval = get_poll_interval()

        if interval == 0:
            # Market closed — check every 60s if session changed
            set_poll_status(False)
            await asyncio.sleep(60)
            continue

        try:
            # Poll sequentially to avoid clientId conflicts
            await _poll_vix()
            await _poll_quotes()
            await _poll_portfolio()
            set_poll_status(True)
        except asyncio.CancelledError:
            logger.info("SSE polling loop cancelled")
            raise
        except Exception as e:
            logger.warning(f"Polling cycle error: {e}")
            set_poll_status(False)

        await asyncio.sleep(interval)


async def _poll_vix():
    """Fetch VIX and compute regime."""
    try:
        # Try IBKR quotes for VIX
        ibkr_data = await _fetch_ibkr_quotes(["VIX"])

        vix_value = None
        data_source = "unknown"

        if ibkr_data and "VIX" in ibkr_data:
            q = ibkr_data["VIX"]
            vix_value = q.get("last") or q.get("close")
            data_source = "live" if _is_us_market_open() else "delayed"

        # Fallback to DB
        if vix_value is None:
            db_vix, db_date = _db_last_vix()
            if db_vix is not None:
                vix_value = db_vix
                data_source = f"db ({db_date})"

        if vix_value is not None:
            regime = _vix_regime(vix_value)

            # Compute change vs previous close from DB
            prev_vix, _ = _db_last_vix()
            change = round(vix_value - prev_vix, 2) if prev_vix else 0
            change_pct = round((change / prev_vix) * 100, 2) if prev_vix else 0

            await update_cache("vix", {
                "vix": round(vix_value, 2),
                "regime": regime,
                "change": change,
                "change_pct": change_pct,
                "market_open": _is_us_market_open(),
                "data_source": data_source,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.debug(f"VIX poll failed: {e}")


async def _poll_quotes():
    """Fetch market quotes."""
    try:
        ibkr_data = await _fetch_ibkr_quotes(MARKET_SYMBOLS)
        if ibkr_data:
            quotes = []
            for sym in MARKET_SYMBOLS:
                q = ibkr_data.get(sym, {})
                if q:
                    quotes.append({
                        "symbol": sym,
                        "price": q.get("last") or q.get("close"),
                        "change": q.get("change"),
                        "change_pct": q.get("change_pct"),
                        "bid": q.get("bid"),
                        "ask": q.get("ask"),
                        "volume": q.get("volume"),
                    })

            if quotes:
                session = _us_market_session()
                await update_cache("quotes", {
                    "quotes": quotes,
                    "market_open": _is_us_market_open(),
                    "market_session": session,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
    except Exception as e:
        logger.debug(f"Quotes poll failed: {e}")


async def _poll_portfolio():
    """Fetch portfolio positions and compute summary."""
    try:
        data = await _fetch_ibkr_portfolio()
        if data and isinstance(data, dict):
            positions = data.get("positions", [])

            await update_cache("positions", {
                "positions": positions,
                "source": "ibkr",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

            # Compute summary
            open_positions = [p for p in positions if p.get("status") == "open"]
            total_pnl = sum(p.get("unrealized_pnl", 0) for p in open_positions)
            total_risk = sum(abs(p.get("max_loss", 0)) for p in open_positions)

            await update_cache("summary", {
                "total_positions": len(positions),
                "open_positions": len(open_positions),
                "total_unrealized_pnl": round(total_pnl, 2),
                "total_capital_at_risk": round(total_risk, 2),
                "source": "ibkr",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.debug(f"Portfolio poll failed: {e}")
