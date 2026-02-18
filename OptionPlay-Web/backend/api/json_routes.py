"""JSON API routes that return structured data from OptionPlay internals."""

from dataclasses import asdict
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
import asyncio
import os

from .routes import get_server

router = APIRouter()


# ── Request models ──

class QuotesRequest(BaseModel):
    symbols: List[str]

class ScanRequest(BaseModel):
    strategy: str = "multi"
    min_score: float = 3.5
    list_type: str = "stable"
    max_results: int = 10


# ── Helpers ──

def _vix_regime(vix: float) -> str:
    if vix <= 15:
        return "Low"
    if vix <= 20:
        return "Normal"
    if vix <= 25:
        return "Elevated"
    return "High"


def _error(msg: str, status: int = 503) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=status)


# Default TWS ports (paper=7497, live=7496, gateway=4001)
IBKR_HOST = "127.0.0.1"
IBKR_PORT = 7497


def _ibkr_news_sync(symbol: str, days: int = 5, count: int = 5):
    """Fetch IBKR news via subprocess using OptionPlay's venv."""
    import socket
    import subprocess
    import json as _json

    # Quick port check
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    if sock.connect_ex((IBKR_HOST, IBKR_PORT)) != 0:
        sock.close()
        return None
    sock.close()

    # Run in OptionPlay's venv where ib_insync works with asyncio.run()
    optionplay_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
    )
    python = os.path.join(optionplay_dir, "venv", "bin", "python")
    if not os.path.exists(python):
        return None

    script = f"""
import asyncio, json, sys
sys.path.insert(0, {optionplay_dir!r})

async def main():
    from src.ibkr.bridge import get_ibkr_bridge
    bridge = get_ibkr_bridge()
    news = await bridge.get_news([{symbol!r}], days={days}, max_per_symbol={count})
    import re
    def clean(h):
        return re.sub(r'\\{{[^}}]*\\}}', '', h).strip()
    result = [
        {{"title": clean(n.headline), "publisher": n.provider or "IBKR",
          "link": None, "timestamp": 0,
          "date": n.time or ""}}
        for n in news
    ]
    print(json.dumps(result))

asyncio.run(main())
"""
    try:
        result = subprocess.run(
            [python, "-c", script],
            capture_output=True, text=True, timeout=20,
            cwd=optionplay_dir,
        )
        if result.returncode == 0 and result.stdout.strip():
            return _json.loads(result.stdout.strip())
    except Exception:
        pass
    return None


async def _fetch_ibkr_news(symbol: str, days: int = 5, count: int = 5):
    """Async wrapper: runs IBKR news fetch in thread pool."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(
            None, _ibkr_news_sync, symbol, days, count
        )
    except Exception:
        return None


def _ibkr_portfolio_sync():
    """Fetch IBKR portfolio positions via subprocess using OptionPlay's venv."""
    import socket
    import subprocess
    import json as _json

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    if sock.connect_ex((IBKR_HOST, IBKR_PORT)) != 0:
        sock.close()
        return None
    sock.close()

    optionplay_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
    )
    python = os.path.join(optionplay_dir, "venv", "bin", "python")
    if not os.path.exists(python):
        return None

    script = f"""
import asyncio, json, sys
sys.path.insert(0, {optionplay_dir!r})

async def main():
    from ib_insync import IB
    ib = IB()
    await ib.connectAsync('{IBKR_HOST}', {IBKR_PORT}, clientId=99, timeout=10)
    raw = ib.portfolio()

    positions = []
    for item in raw:
        c = item.contract
        pos = {{
            "symbol": c.symbol,
            "sec_type": c.secType,
            "quantity": item.position,
            "avg_cost": item.averageCost,
            "market_value": item.marketValue,
            "unrealized_pnl": item.unrealizedPNL,
            "realized_pnl": item.realizedPNL,
        }}
        if c.secType == "OPT":
            pos["strike"] = c.strike
            pos["right"] = c.right
            pos["expiry"] = c.lastTradeDateOrContractMonth
        positions.append(pos)

    ib.disconnect()

    options = [p for p in positions if p["sec_type"] == "OPT"]
    stocks = [p for p in positions if p["sec_type"] == "STK"]

    groups = {{}}
    for o in options:
        key = (o["symbol"], o.get("expiry", ""))
        groups.setdefault(key, []).append(o)

    spreads = []
    M = set()  # matched ids

    for (sym, expiry), opts in groups.items():
        puts = sorted([o for o in opts if o["right"] == "P"], key=lambda x: x["strike"])
        calls = sorted([o for o in opts if o["right"] == "C"], key=lambda x: x["strike"])
        sp_ = [p for p in puts if p["quantity"] < 0]
        lp_ = [p for p in puts if p["quantity"] > 0]
        sc_ = [c for c in calls if c["quantity"] < 0]
        lc_ = [c for c in calls if c["quantity"] > 0]

        def avail(*legs): return all(id(l) not in M for l in legs)
        def mark(*legs):
            for l in legs: M.add(id(l))
        def nc2(a, b): return (a["avg_cost"] - b["avg_cost"]) / 100
        def pnl(*legs): return sum(l.get("unrealized_pnl", 0) or 0 for l in legs)
        def mktv(*legs): return sum(l.get("market_value", 0) or 0 for l in legs)

        # ── PASS 1: 4-leg (Iron Condor / Iron Butterfly) ──
        for lp in lp_:
            for sp in sp_:
                for sc in sc_:
                    for lc in lc_:
                        if not avail(lp, sp, sc, lc): continue
                        q = abs(lp["quantity"])
                        if not (abs(sp["quantity"]) == abs(sc["quantity"]) == abs(lc["quantity"]) == q): continue
                        if not (lp["strike"] < sp["strike"] and sp["strike"] <= sc["strike"] and sc["strike"] < lc["strike"]): continue
                        pw = sp["strike"] - lp["strike"]
                        cw = lc["strike"] - sc["strike"]
                        nc = nc2(sp, lp) + nc2(sc, lc)
                        tp = "Iron Butterfly" if sp["strike"] == sc["strike"] else "Iron Condor"
                        spreads.append({{
                            "type": tp, "symbol": sym, "expiry": expiry,
                            "short_strike": sp["strike"], "long_strike": lp["strike"],
                            "short_call_strike": sc["strike"], "long_call_strike": lc["strike"],
                            "width": max(pw, cw), "contracts": int(q), "net_credit": nc,
                            "unrealized_pnl": pnl(lp, sp, sc, lc), "market_value": mktv(lp, sp, sc, lc),
                        }})
                        mark(lp, sp, sc, lc)

        # ── PASS 2: 3-leg (Butterfly) ──
        # Call Butterfly: long low + 2x short mid + long high
        for i, lc1 in enumerate(lc_):
            if not avail(lc1): continue
            for sc in sc_:
                if not avail(sc): continue
                if sc["strike"] <= lc1["strike"]: continue
                if abs(sc["quantity"]) != 2 * abs(lc1["quantity"]): continue
                for lc2 in lc_[i+1:]:
                    if not avail(lc2): continue
                    if lc2["strike"] <= sc["strike"]: continue
                    if abs(lc2["quantity"]) != abs(lc1["quantity"]): continue
                    if sc["strike"] - lc1["strike"] != lc2["strike"] - sc["strike"]: continue
                    w = sc["strike"] - lc1["strike"]
                    nd = (lc1["avg_cost"] + lc2["avg_cost"] - sc["avg_cost"]) / 100
                    spreads.append({{
                        "type": "Call Butterfly", "symbol": sym, "expiry": expiry,
                        "short_strike": sc["strike"], "long_strike": lc1["strike"],
                        "long_call_strike": lc2["strike"],
                        "width": w, "contracts": int(abs(lc1["quantity"])), "net_credit": -nd,
                        "unrealized_pnl": pnl(lc1, sc, lc2), "market_value": mktv(lc1, sc, lc2),
                    }})
                    mark(lc1, sc, lc2); break
                else: continue
                break

        # Put Butterfly: long high + 2x short mid + long low
        for i, lp1 in enumerate(reversed(lp_)):
            if not avail(lp1): continue
            for sp in reversed(sp_):
                if not avail(sp): continue
                if sp["strike"] >= lp1["strike"]: continue
                if abs(sp["quantity"]) != 2 * abs(lp1["quantity"]): continue
                for lp2 in lp_:
                    if not avail(lp2): continue
                    if lp2["strike"] >= sp["strike"]: continue
                    if abs(lp2["quantity"]) != abs(lp1["quantity"]): continue
                    if lp1["strike"] - sp["strike"] != sp["strike"] - lp2["strike"]: continue
                    w = lp1["strike"] - sp["strike"]
                    nd = (lp1["avg_cost"] + lp2["avg_cost"] - sp["avg_cost"]) / 100
                    spreads.append({{
                        "type": "Put Butterfly", "symbol": sym, "expiry": expiry,
                        "short_strike": sp["strike"], "long_strike": lp2["strike"],
                        "long_put_strike": lp1["strike"],
                        "width": w, "contracts": int(abs(lp1["quantity"])), "net_credit": -nd,
                        "unrealized_pnl": pnl(lp1, sp, lp2), "market_value": mktv(lp1, sp, lp2),
                    }})
                    mark(lp1, sp, lp2); break
                else: continue
                break

        # ── PASS 3a: Straddle / Strangle ──
        for c in (sc_ + lc_):
            if not avail(c): continue
            for p in (sp_ + lp_):
                if not avail(p): continue
                if abs(c["quantity"]) != abs(p["quantity"]): continue
                if (c["quantity"] > 0) != (p["quantity"] > 0): continue
                is_long = c["quantity"] > 0
                if c["strike"] == p["strike"]:
                    tp = "Long Straddle" if is_long else "Short Straddle"
                elif c["strike"] > p["strike"]:
                    tp = "Long Strangle" if is_long else "Short Strangle"
                else:
                    continue
                prem = (c["avg_cost"] + p["avg_cost"]) / 100
                spreads.append({{
                    "type": tp, "symbol": sym, "expiry": expiry,
                    "short_strike": p["strike"] if not is_long else None,
                    "long_strike": c["strike"] if is_long else None,
                    "put_strike": p["strike"], "call_strike": c["strike"],
                    "width": abs(c["strike"] - p["strike"]),
                    "contracts": int(abs(c["quantity"])),
                    "net_credit": prem if not is_long else -prem,
                    "unrealized_pnl": pnl(c, p), "market_value": mktv(c, p),
                }})
                mark(c, p); break

        # ── PASS 3b: 2-leg vertical spreads ──
        # Bull Put Spread
        for sp in sp_:
            if not avail(sp): continue
            for lp in lp_:
                if not avail(lp): continue
                if lp["strike"] < sp["strike"] and abs(lp["quantity"]) == abs(sp["quantity"]):
                    spreads.append({{
                        "type": "Bull Put Spread", "symbol": sym, "expiry": expiry,
                        "short_strike": sp["strike"], "long_strike": lp["strike"],
                        "width": sp["strike"] - lp["strike"],
                        "contracts": int(abs(sp["quantity"])), "net_credit": nc2(sp, lp),
                        "unrealized_pnl": pnl(sp, lp), "market_value": mktv(sp, lp),
                    }})
                    mark(sp, lp); break

        # Call verticals
        for sc in sc_:
            if not avail(sc): continue
            for lc in lc_:
                if not avail(lc): continue
                if abs(lc["quantity"]) != abs(sc["quantity"]): continue
                w = abs(lc["strike"] - sc["strike"])
                if sc["strike"] < lc["strike"]:
                    spreads.append({{
                        "type": "Bear Call Spread", "symbol": sym, "expiry": expiry,
                        "short_strike": sc["strike"], "long_strike": lc["strike"],
                        "width": w, "contracts": int(abs(sc["quantity"])), "net_credit": nc2(sc, lc),
                        "unrealized_pnl": pnl(sc, lc), "market_value": mktv(sc, lc),
                    }})
                else:
                    nd = nc2(lc, sc)
                    spreads.append({{
                        "type": "Bull Call Spread", "symbol": sym, "expiry": expiry,
                        "short_strike": sc["strike"], "long_strike": lc["strike"],
                        "width": w, "contracts": int(abs(sc["quantity"])), "net_credit": -nd,
                        "unrealized_pnl": pnl(sc, lc), "market_value": mktv(sc, lc),
                    }})
                mark(sc, lc); break

        # Bear Put Spread
        for lp in lp_:
            if not avail(lp): continue
            for sp in sp_:
                if not avail(sp): continue
                if sp["strike"] < lp["strike"] and abs(sp["quantity"]) == abs(lp["quantity"]):
                    nd = nc2(lp, sp)
                    spreads.append({{
                        "type": "Bear Put Spread", "symbol": sym, "expiry": expiry,
                        "short_strike": sp["strike"], "long_strike": lp["strike"],
                        "width": lp["strike"] - sp["strike"],
                        "contracts": int(abs(sp["quantity"])), "net_credit": -nd,
                        "unrealized_pnl": pnl(sp, lp), "market_value": mktv(sp, lp),
                    }})
                    mark(sp, lp); break

    # ── PASS 4: Remaining unmatched ──
    naked = []
    for o in options:
        if id(o) not in M:
            naked.append({{
                "symbol": o["symbol"], "sec_type": o["sec_type"],
                "strike": o["strike"], "right": o["right"],
                "expiry": o.get("expiry", ""), "quantity": o["quantity"],
                "avg_cost": o["avg_cost"],
                "unrealized_pnl": o.get("unrealized_pnl", 0),
                "market_value": o.get("market_value", 0),
            }})

    result = {{"positions": positions, "spreads": spreads, "naked": naked, "stocks": stocks}}
    print(json.dumps(result))

asyncio.run(main())
"""
    try:
        result = subprocess.run(
            [python, "-c", script],
            capture_output=True, text=True, timeout=20,
            cwd=optionplay_dir,
        )
        if result.returncode == 0 and result.stdout.strip():
            return _json.loads(result.stdout.strip())
    except Exception:
        pass
    return None


async def _fetch_ibkr_portfolio():
    """Async wrapper: runs IBKR portfolio fetch in thread pool."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _ibkr_portfolio_sync)
    except Exception:
        return None


# ── Endpoints ──

@router.get("/vix")
async def get_vix():
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        vix = await server.handlers.vix.get_vix()
        if vix is None:
            return _error("VIX data unavailable")
        return {"vix": round(vix, 2), "regime": _vix_regime(vix)}
    except Exception as e:
        return _error(str(e))


@router.post("/quotes")
async def get_quotes(req: QuotesRequest):
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        quotes = []
        for sym in req.symbols:
            try:
                quote = await server.handlers.quote._get_quote_cached(sym.upper())
                if quote:
                    quotes.append({
                        "symbol": sym.upper(),
                        "price": quote.last,
                        "change": None,
                        "change_pct": None,
                    })
            except Exception:
                pass
        return {"quotes": quotes}
    except Exception as e:
        return _error(str(e))


@router.post("/scan")
async def run_scan(req: ScanRequest):
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        scan_handler = server.handlers.scan

        # Map strategy string to ScanMode
        from src.scanner.multi_strategy_scanner import ScanMode
        mode_map = {
            "multi": ScanMode.BEST_SIGNAL,
            "pullback": ScanMode.PULLBACK_ONLY,
            "bounce": ScanMode.BOUNCE_ONLY,
            "breakout": ScanMode.BREAKOUT_ONLY,
            "dip": ScanMode.EARNINGS_DIP,
            "trend": ScanMode.TREND_ONLY,
        }
        mode = mode_map.get(req.strategy, ScanMode.BEST_SIGNAL)

        # Build scanner and data fetcher, then scan directly
        scanner = scan_handler._get_multi_scanner(min_score=req.min_score)

        # Get symbols from watchlist
        from src.config.watchlist_loader import get_watchlist_loader
        watchlist_loader = get_watchlist_loader()
        symbols = watchlist_loader.get_symbols_by_list_type(req.list_type)

        # Build data fetcher
        prefetch_cache = {}

        async def prefetch_batch(batch_syms):
            tasks = [
                scan_handler._fetch_historical_cached(sym, days=260)
                for sym in batch_syms
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for sym, result in zip(batch_syms, results):
                if result is not None and not isinstance(result, Exception):
                    prefetch_cache[sym] = result

        batch_size = 20
        for i in range(0, len(symbols), batch_size):
            await prefetch_batch(symbols[i:i + batch_size])

        async def data_fetcher(symbol):
            if symbol in prefetch_cache:
                return prefetch_cache[symbol]
            return await scan_handler._fetch_historical_cached(symbol, days=260)

        result = await scanner.scan_async(
            symbols=symbols,
            data_fetcher=data_fetcher,
            mode=mode,
        )

        # Trim to max_results
        result.signals = sorted(
            result.signals, key=lambda s: s.score, reverse=True
        )[:req.max_results]

        scan_dict = result.to_dict()

        # Enrich signals with sector, earnings, win_rate from DB
        try:
            syms = [s.symbol for s in result.signals]
            if syms:
                import sqlite3 as _sql
                from datetime import date as _date
                _db = os.path.expanduser("~/.optionplay/trades.db")
                _conn = _sql.connect(_db)
                _ph = ",".join("?" * len(syms))

                fund_rows = _conn.execute(
                    f"SELECT symbol, sector, historical_win_rate, stability_score FROM symbol_fundamentals WHERE symbol IN ({_ph})",
                    syms,
                ).fetchall()
                fund = {r[0]: {"sector": r[1], "win_rate": r[2], "stability_score": r[3]} for r in fund_rows}

                earn_rows = _conn.execute(
                    f"SELECT symbol, MIN(earnings_date) FROM earnings_history WHERE symbol IN ({_ph}) AND earnings_date >= date('now') GROUP BY symbol",
                    syms,
                ).fetchall()
                earn = {r[0]: r[1] for r in earn_rows}
                _conn.close()

                today = _date.today()
                for sig in scan_dict["signals"]:
                    sym = sig["symbol"]
                    f = fund.get(sym, {})
                    sig["sector"] = f.get("sector")
                    sig["win_rate"] = f.get("win_rate")
                    # Fill stability_score if scanner didn't provide it
                    stab = sig.get("details", {}).get("stability", {})
                    if not stab or not stab.get("score"):
                        sig["stability_score"] = f.get("stability_score")
                    else:
                        sig["stability_score"] = stab.get("score")
                    edate_str = earn.get(sym)
                    if edate_str:
                        sig["earnings_date"] = edate_str
                        sig["days_to_earnings"] = (_date.fromisoformat(edate_str) - today).days
                    else:
                        sig["earnings_date"] = None
                        sig["days_to_earnings"] = None
        except Exception:
            pass  # enrichment failure should not break scan results

        return scan_dict
    except Exception as e:
        return _error(str(e))


@router.get("/analyze/{symbol}")
async def analyze_symbol(symbol: str):
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        symbol = symbol.upper()
        scan_handler = server.handlers.scan

        # Get quote for current price
        quote = await server.handlers.quote._get_quote_cached(symbol)
        price = quote.last if quote else None

        # Run multi-strategy analysis (returns signals directly)
        scanner = scan_handler._get_multi_scanner(
            min_score=0, exclude_earnings_within_days=0
        )
        historical = await scan_handler._fetch_historical_cached(symbol, days=260)
        if historical is None:
            return _error(f"No historical data for {symbol}")

        prices, volumes, highs, lows = historical[0], historical[1], historical[2], historical[3]
        signals = scanner.analyze_symbol(symbol, prices, volumes, highs, lows)
        strategies = [s.to_dict() for s in signals]

        # Get IV data
        iv_data = None
        try:
            ctx = scan_handler._ctx
            if ctx.tradier_provider:
                iv = await ctx.tradier_provider.get_iv_data(symbol)
                if iv:
                    iv_data = iv.to_dict()
        except Exception:
            pass

        # Compute support & resistance levels
        levels = None
        try:
            from src.indicators.support_resistance import (
                find_support_levels_enhanced, find_resistance_levels_enhanced,
                calculate_fibonacci,
            )
            sr_support = find_support_levels_enhanced(
                lows=lows, lookback=90, window=10, max_levels=5,
                volumes=volumes,
            )
            sr_resistance = find_resistance_levels_enhanced(
                highs=highs, lookback=90, window=10, max_levels=4,
                volumes=volumes,
            )

            FIBONACCI_LOOKBACK = 60
            fb_lookback = min(len(highs), FIBONACCI_LOOKBACK)
            recent_high = max(highs[-fb_lookback:])
            recent_low = min(lows[-fb_lookback:])
            fib = calculate_fibonacci(recent_high, recent_low)

            def level_to_dict(lvl, current):
                strength_pct = round(lvl.strength * 100)
                # Determine type from level characteristics
                if lvl.volume_confirmation > 0.5:
                    lvl_type = "Volume"
                elif lvl.hold_count >= 2:
                    lvl_type = "Tested"
                else:
                    lvl_type = "Swing"
                # Check if near a Fibonacci level (tight 0.5% tolerance)
                fib_tag = None
                for fib_name, fib_price in fib.items():
                    if lvl.price > 0 and abs(lvl.price - fib_price) / lvl.price < 0.005:
                        fib_tag = fib_name
                        break
                return {
                    "price": round(lvl.price, 2),
                    "strength": strength_pct,
                    "type": lvl_type,
                    "fib": fib_tag,
                    "touches": lvl.touches,
                    "holdRate": round(lvl.hold_rate, 2) if lvl.hold_rate > 0 else None,
                }

            supports = [
                level_to_dict(lvl, price)
                for lvl in sr_support.support_levels
                if price and lvl.price < price
            ]
            resistances = [
                level_to_dict(lvl, price)
                for lvl in sr_resistance.resistance_levels
                if price and lvl.price > price
            ]

            if supports or resistances:
                levels = {
                    "supports": supports,
                    "resistances": resistances,
                }
        except Exception:
            pass

        # Build recommendation using StrikeRecommender (playbook-compliant)
        recommendation = None
        try:
            from src.options.strike_recommender import StrikeRecommender
            from src.indicators.support_resistance import (
                find_support_levels, calculate_fibonacci,
            )
            from src.constants.trading_rules import (
                SPREAD_DTE_MIN, SPREAD_DTE_MAX,
            )
            FIBONACCI_LOOKBACK = 60

            current_price = price
            if current_price:
                # VIX + regime for spread width decisions
                analysis_handler = server.handlers.analysis
                vix = await server.handlers.vix.get_vix()
                regime = analysis_handler._ctx.vix_selector.get_regime(vix) if vix else None

                # Support levels from lows
                support_levels = find_support_levels(
                    lows=lows, lookback=90, window=10, max_levels=5
                )
                support_levels = [s for s in support_levels if s < current_price]

                # Fibonacci retracements
                lookback = min(len(highs), FIBONACCI_LOOKBACK)
                recent_high = max(highs[-lookback:])
                recent_low = min(lows[-lookback:])
                fib_levels = calculate_fibonacci(recent_high, recent_low)

                # Options chain for real delta/credit data
                options = await analysis_handler._get_options_chain_with_fallback(
                    symbol, dte_min=SPREAD_DTE_MIN, dte_max=SPREAD_DTE_MAX, right="P"
                )

                options_data = None
                if options:
                    from datetime import date
                    options_data = [
                        {
                            "strike": opt.strike,
                            "right": "P",
                            "bid": opt.bid,
                            "ask": opt.ask,
                            "delta": opt.delta,
                            "iv": opt.implied_volatility,
                            "dte": (opt.expiry - date.today()).days,
                            "open_interest": opt.open_interest,
                            "volume": opt.volume,
                        }
                        for opt in options
                    ]

                recommender = StrikeRecommender()
                rec = recommender.get_recommendation(
                    symbol=symbol,
                    current_price=current_price,
                    support_levels=support_levels,
                    options_data=options_data,
                    fib_levels=[
                        {"level": v, "fib": k}
                        for k, v in fib_levels.items()
                        if v < current_price
                    ],
                    dte=SPREAD_DTE_MIN,
                    regime=regime,
                )
                if rec:
                    recommendation = rec.to_dict()
                    # Add DTE and expiration from options chain
                    if options_data:
                        from collections import Counter
                        dte_counts = Counter(
                            o["dte"] for o in options_data if o.get("dte")
                        )
                        if dte_counts:
                            best_dte = dte_counts.most_common(1)[0][0]
                            recommendation["dte"] = best_dte
                            from datetime import date, timedelta
                            exp_date = date.today() + timedelta(days=best_dte)
                            recommendation["expiration"] = exp_date.isoformat()
                    # Add top signal context
                    if signals:
                        top = max(signals, key=lambda s: s.score)
                        recommendation["top_strategy"] = top.strategy
                        recommendation["top_score"] = top.score
                        recommendation["top_strength"] = (
                            top.strength.value
                            if hasattr(top.strength, "value")
                            else str(top.strength)
                        )
        except Exception:
            # Fall back to basic signal info if strike recommendation fails
            if signals:
                top = max(signals, key=lambda s: s.score)
                recommendation = {
                    "strategy": top.strategy,
                    "score": top.score,
                    "strength": (
                        top.strength.value
                        if hasattr(top.strength, "value")
                        else str(top.strength)
                    ),
                    "reason": top.reason,
                    "data_source": "signal_only",
                }

        # Fetch analyst data (sync yfinance call, run in thread pool)
        analysts_data = None
        try:
            loop = asyncio.get_event_loop()

            from src.data_providers.fundamentals import get_analyst_data

            analysts_raw = await loop.run_in_executor(
                None, get_analyst_data, symbol
            )

            if analysts_raw and (analysts_raw.get("total_ratings", 0) > 0 or analysts_raw.get("target_median")):
                analysts_data = analysts_raw
        except Exception:
            pass

        # Fetch news from IBKR TWS (direct sync connection in thread)
        news_data = None
        try:
            news_data = await _fetch_ibkr_news(symbol)
        except Exception:
            pass

        # Fallback to yfinance news if IBKR unavailable
        if not news_data:
            try:
                loop = asyncio.get_event_loop()
                from src.data_providers.yahoo_news import get_stock_news

                news_raw = await loop.run_in_executor(
                    None, get_stock_news, symbol, 5
                )
                if news_raw:
                    news_data = news_raw
            except Exception:
                pass

        return {
            "symbol": symbol,
            "price": price,
            "strategies": strategies,
            "iv": iv_data,
            "levels": levels,
            "recommendation": recommendation,
            "news": news_data,
            "analysts": analysts_data,
        }
    except Exception as e:
        return _error(str(e))


@router.get("/news/{symbol}")
async def get_news(symbol: str, count: int = 5):
    symbol = symbol.upper()

    # Try IBKR TWS first (direct sync connection)
    try:
        ibkr_news = await _fetch_ibkr_news(symbol, days=5, count=count)
        if ibkr_news:
            return {"symbol": symbol, "source": "ibkr", "news": ibkr_news}
    except Exception:
        pass

    # Fallback to yfinance
    try:
        loop = asyncio.get_event_loop()

        from src.data_providers.yahoo_news import get_stock_news
        news = await loop.run_in_executor(None, get_stock_news, symbol, count)

        return {
            "symbol": symbol,
            "source": "yfinance",
            "news": news or [],
        }
    except Exception as e:
        return _error(str(e))


@router.get("/portfolio/positions")
async def get_portfolio_positions(status: str = "all"):
    # Try IBKR live positions first
    ibkr_data = await _fetch_ibkr_portfolio()
    if ibkr_data:
        spreads = ibkr_data.get("spreads", [])
        naked = ibkr_data.get("naked", [])
        stocks = ibkr_data.get("stocks", [])

        from datetime import datetime

        def _parse_expiry(expiry_str):
            try:
                exp_date = datetime.strptime(expiry_str, "%Y%m%d").date()
                dte = (exp_date - datetime.now().date()).days
                return exp_date.isoformat(), dte
            except (ValueError, KeyError):
                return expiry_str, None

        # Build spread positions
        spread_positions = []
        for s in spreads:
            exp_str, dte = _parse_expiry(s.get("expiry", ""))
            width = s["width"]
            nc = s["net_credit"]  # positive=credit, negative=debit
            contracts = s["contracts"]

            if nc >= 0:
                # Credit spread
                max_profit = nc * contracts * 100
                max_loss = (width - nc) * contracts * 100
            else:
                # Debit spread
                net_debit = abs(nc)
                max_profit = (width - net_debit) * contracts * 100
                max_loss = net_debit * contracts * 100

            pos = {
                "id": f"ibkr-{s['symbol']}-{s['type'][:3]}-{s.get('expiry','')}",
                "symbol": s["symbol"],
                "strategy": s["type"],
                "status": "open",
                "short_strike": s.get("short_strike"),
                "long_strike": s.get("long_strike"),
                "spread_width": width,
                "expiration": exp_str,
                "dte": dte,
                "contracts": contracts,
                "net_credit": round(nc, 2) if nc >= 0 else None,
                "debit": round(abs(nc), 2) if nc < 0 else None,
                "max_profit": round(max_profit, 2),
                "max_loss": round(max_loss, 2),
                "unrealized_pnl": round(s.get("unrealized_pnl", 0) or 0, 2),
                "market_value": round(s.get("market_value", 0) or 0, 2),
                "source": "ibkr",
            }
            # Extra fields for multi-leg strategies
            for key in ("short_call_strike", "long_call_strike",
                        "long_put_strike", "put_strike", "call_strike"):
                if key in s:
                    pos[key] = s[key]
            spread_positions.append(pos)

        # Naked options (unmatched legs)
        naked_positions = []
        for n in naked:
            exp_str, dte = _parse_expiry(n.get("expiry", ""))
            right_label = "Put" if n["right"] == "P" else "Call"
            qty = n["quantity"]
            is_short = qty < 0
            strategy = f"{'Short' if is_short else 'Long'} {right_label}"
            premium_per_share = n["avg_cost"] / 100

            naked_positions.append({
                "id": f"ibkr-{n['symbol']}-{n['right']}{n['strike']:.0f}-{n.get('expiry','')}",
                "symbol": n["symbol"],
                "strategy": strategy,
                "status": "open",
                "short_strike": n["strike"] if is_short else None,
                "long_strike": n["strike"] if not is_short else None,
                "expiration": exp_str,
                "dte": dte,
                "contracts": int(abs(qty)),
                "net_credit": round(premium_per_share, 2) if is_short else None,
                "debit": round(premium_per_share, 2) if not is_short else None,
                "max_profit": round(premium_per_share * abs(qty) * 100, 2) if is_short else None,
                "max_loss": None,
                "unrealized_pnl": round(n.get("unrealized_pnl", 0) or 0, 2),
                "market_value": round(n.get("market_value", 0) or 0, 2),
                "source": "ibkr",
            })

        # Stock positions
        stock_positions = []
        for p in stocks:
            stock_positions.append({
                "id": f"ibkr-{p['symbol']}-STK",
                "symbol": p["symbol"],
                "strategy": "Stock",
                "status": "open",
                "quantity": p["quantity"],
                "avg_cost": p["avg_cost"],
                "source": "ibkr",
            })

        positions = spread_positions + naked_positions + stock_positions

        if status == "open":
            positions = [p for p in positions if p.get("status") == "open"]
        elif status == "closed":
            positions = [p for p in positions if p.get("status") == "closed"]

        return {"positions": positions, "source": "ibkr"}

    # Fallback to local portfolio manager
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        from src.portfolio import get_portfolio_manager
        portfolio = get_portfolio_manager()

        if status == "open":
            positions = portfolio.get_open_positions()
        elif status == "closed":
            positions = portfolio.get_closed_positions()
        else:
            positions = portfolio.get_all_positions()

        return {"positions": [p.to_dict() for p in positions], "source": "local"}
    except Exception as e:
        return _error(str(e))


@router.get("/portfolio/summary")
async def get_portfolio_summary():
    # Try IBKR live portfolio first
    ibkr_data = await _fetch_ibkr_portfolio()
    if ibkr_data:
        spreads = ibkr_data.get("spreads", [])
        naked = ibkr_data.get("naked", [])

        total_credit = 0
        total_max_loss = 0
        for s in spreads:
            total_credit += s["net_credit"] * s["contracts"] * 100
            total_max_loss += (s["width"] - s["net_credit"]) * s["contracts"] * 100
        for n in naked:
            if n["quantity"] < 0:
                total_credit += n["avg_cost"] * abs(n["quantity"])

        return {
            "total_positions": len(spreads) + len(naked),
            "open_positions": len(spreads) + len(naked),
            "spreads": len(spreads),
            "naked_options": len(naked),
            "closed_positions": 0,
            "total_realized_pnl": 0,
            "total_unrealized_pnl": 0.0,
            "total_credit_received": round(total_credit, 2),
            "total_capital_at_risk": round(total_max_loss, 2),
            "win_rate": 0.0,
            "avg_profit": 0.0,
            "positions_expiring_soon": 0,
            "source": "ibkr",
        }

    # Fallback to local portfolio manager
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        from src.portfolio import get_portfolio_manager
        portfolio = get_portfolio_manager()
        summary = portfolio.get_summary()
        result = asdict(summary)
        result["source"] = "local"
        return result
    except Exception as e:
        return _error(str(e))
