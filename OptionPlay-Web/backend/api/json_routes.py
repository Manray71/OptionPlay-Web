"""JSON API routes that return structured data from OptionPlay internals."""

from dataclasses import asdict
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
import asyncio

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

        return result.to_dict()
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

        return {
            "symbol": symbol,
            "price": price,
            "strategies": strategies,
            "iv": iv_data,
            "recommendation": recommendation,
            "news": None,
            "analysts": None,
        }
    except Exception as e:
        return _error(str(e))


@router.get("/portfolio/positions")
async def get_portfolio_positions(status: str = "all"):
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

        return {"positions": [p.to_dict() for p in positions]}
    except Exception as e:
        return _error(str(e))


@router.get("/portfolio/summary")
async def get_portfolio_summary():
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        from src.portfolio import get_portfolio_manager
        portfolio = get_portfolio_manager()
        summary = portfolio.get_summary()
        return asdict(summary)
    except Exception as e:
        return _error(str(e))
