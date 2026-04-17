"""JSON API routes that return structured data from OptionPlay internals."""

from dataclasses import asdict
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator
from typing import List, Optional
import asyncio
import os
import re

from ..rate_limit import limiter
from .auth import validate_symbol
from .routes import get_server
from .news_sentiment import enrich_news_sentiment

_SYMBOL_RE = re.compile(r"^[A-Z0-9]{1,6}([.\-][A-Z]{1,2})?!?$")

router = APIRouter()


# ── Request models ──

class QuotesRequest(BaseModel):
    symbols: List[str]

    @field_validator("symbols")
    @classmethod
    def validate_symbols(cls, v):
        cleaned = []
        for s in v:
            norm = s.strip().upper()
            if not _SYMBOL_RE.match(norm):
                raise ValueError(f"Invalid symbol: {s}")
            cleaned.append(norm)
        if len(cleaned) > 50:
            raise ValueError("Too many symbols (max 50)")
        return cleaned

class ScanRequest(BaseModel):
    strategy: str = "multi"
    min_score: float = 3.5
    list_type: str = "stable"
    max_results: int = 10

class ShadowLogRequest(BaseModel):
    symbol: str
    strategy: str

    @field_validator("symbol")
    @classmethod
    def validate_symbol_field(cls, v):
        norm = v.strip().upper()
        if not _SYMBOL_RE.match(norm):
            raise ValueError(f"Invalid symbol: {v}")
        return norm
    score: float
    short_strike: float
    long_strike: float
    spread_width: float
    est_credit: float
    expiration: str
    dte: int
    price_at_log: float
    enhanced_score: Optional[float] = None
    liquidity_tier: Optional[int] = None
    stability_at_log: Optional[float] = None
    trade_context: Optional[dict] = None


# ── Helpers (extracted to services/ibkr_helpers.py) ──

from ..services.ibkr_helpers import (  # noqa: E402
    _vix_regime,
    _is_us_market_open,
    _us_market_session,
    _db_last_close,
    _db_last_vix,
    _fetch_ibkr_news,
    _fetch_ibkr_portfolio,
    _fetch_ibkr_quotes,
)


def _error(msg: str, status: int = 503) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=status)


# ── Endpoints ──

@router.get("/vix")
async def get_vix():
    market_open = _is_us_market_open()
    data_source = "live"
    vix = None
    vix_date = None

    # 1. Try live VIX from IBKR Gateway (subprocess)
    vix_prev_close = None
    ibkr_quotes = await _fetch_ibkr_quotes(["VIX"])
    if ibkr_quotes and "VIX" in ibkr_quotes:
        vix = ibkr_quotes["VIX"]["price"]
        vix_prev_close = ibkr_quotes["VIX"].get("prev_close")

    # 2. Fallback: local DB (last trading day close)
    if vix is None:
        vix, vix_date = _db_last_vix()
        data_source = "local_db"

    if vix is None:
        return _error("VIX data unavailable")

    # Calculate change from IBKR prev_close or yfinance fallback
    vix_change = None
    vix_change_pct = None
    prev_close = vix_prev_close
    if prev_close is None:
        try:
            import yfinance as yf
            loop = asyncio.get_event_loop()
            def _fetch_vix_prev_close():
                t = yf.Ticker("^VIX")
                return t.fast_info.previous_close
            prev_close = await loop.run_in_executor(None, _fetch_vix_prev_close)
        except Exception:
            pass
    if prev_close and prev_close > 0:
        vix_change = round(vix - prev_close, 2)
        vix_change_pct = round((vix - prev_close) / prev_close * 100, 2)

    resp = {
        "vix": round(vix, 2),
        "regime": _vix_regime(vix),
        "change": vix_change,
        "change_pct": vix_change_pct,
        "market_open": market_open,
        "data_source": data_source,
    }
    if vix_date:
        resp["as_of"] = vix_date

    # Enrich with v2 regime parameters
    try:
        from src.services.vix_regime import get_regime_params
        params = get_regime_params(vix)
        resp["min_score"] = params.min_score
        resp["max_positions"] = params.max_positions
    except Exception:
        pass

    return resp


@router.get("/regime")
async def get_regime():
    """VIX Regime v2 — interpolated trading parameters."""
    vix = None

    # Try IBKR Gateway first
    ibkr_quotes = await _fetch_ibkr_quotes(["VIX"])
    if ibkr_quotes and "VIX" in ibkr_quotes:
        vix = ibkr_quotes["VIX"]["price"]

    # Fallback to local DB
    if vix is None:
        vix, _ = _db_last_vix()

    try:
        if vix is None:
            return _error("VIX data unavailable")

        from src.services.vix_regime import get_regime_params
        params = get_regime_params(vix, vix_futures_front=None, vix_trend=None)

        return {
            "vix": round(vix, 2),
            "regime": params.regime_label.value,
            "min_score": params.min_score,
            "spread_width": params.spread_width,
            "earnings_buffer_days": params.earnings_buffer_days,
            "max_positions": params.max_positions,
            "max_per_sector": params.max_per_sector,
            "term_structure": params.term_structure,
            "stress_adjusted": params.stress_adjusted,
            "vix_trend": params.vix_trend_label,
        }
    except Exception as e:
        return _error(str(e))


# ── yfinance symbol mapping for non-US instruments ──

YFINANCE_MAP = {
    "XAUUSD": "GC=F",
    "XAGUSD": "SI=F",
    "DEU40": "^GDAXI",
    "EURUSD": "EURUSD=X",
    "CL1!": "CL=F",
    "NDQ": "^IXIC",
    "SPX": "^GSPC",
    "DJI": "^DJI",
}

SYMBOL_NAMES = {
    "SPX": "S&P 500",
    "SPY": "SPDR S&P 500",
    "QQQ": "Invesco QQQ",
    "DJI": "Dow Jones",
    "NDQ": "Nasdaq Comp.",
    "DEU40": "DAX 40",
    "XAUUSD": "Gold",
    "XAGUSD": "Silver",
    "CL1!": "Crude Oil",
    "EURUSD": "EUR/USD",
}


def _yfinance_quote(yf_symbol: str):
    """Fetch quote from yfinance with pre/post-market support.

    Returns (price, change_pct, session) where session is
    'pre_market', 'post_market', or 'regular'.
    """
    try:
        import yfinance as yf

        t = yf.Ticker(yf_symbol)
        info = t.fast_info
        price = getattr(info, "last_price", None)
        prev = getattr(info, "previous_close", None)
        session = "regular"

        # Check for extended-hours prices (available via full info dict)
        if not _is_us_market_open():
            try:
                full = t.info
                pre = full.get("preMarketPrice")
                post = full.get("postMarketPrice")
                if pre and pre > 0:
                    price = pre
                    prev = full.get("regularMarketPreviousClose", prev)
                    session = "pre_market"
                elif post and post > 0:
                    price = post
                    prev = full.get("regularMarketPreviousClose", prev)
                    session = "post_market"
            except Exception:
                pass

        change_pct = None
        if price and prev and prev > 0:
            change_pct = round((price - prev) / prev * 100, 2)
        return price, change_pct, session
    except Exception:
        return None, None, "regular"


@router.post("/quotes")
async def get_quotes(req: QuotesRequest):
    market_open = _is_us_market_open()

    loop = asyncio.get_event_loop()
    quotes = []

    # Split symbols: US equities go to IBKR, mapped symbols go to yfinance
    us_symbols = [s.upper() for s in req.symbols if s.upper() not in YFINANCE_MAP]
    ibkr_prices = {}

    # 1. Batch-fetch US equity quotes from IBKR Gateway (subprocess)
    if us_symbols:
        ibkr_data = await _fetch_ibkr_quotes(us_symbols)
        if ibkr_data:
            ibkr_prices = ibkr_data

    for sym in req.symbols:
        sym_upper = sym.upper()
        price = None
        change_pct = None
        data_source = None
        as_of = None

        # 1a. Use IBKR quote if available
        if sym_upper in ibkr_prices:
            q = ibkr_prices[sym_upper]
            price = q["price"]
            data_source = "live"
            prev = q.get("prev_close")
            if prev and prev > 0:
                change_pct = round((price - prev) / prev * 100, 2)

        # 2. yfinance for change_pct (always) or price (if IBKR failed / non-US)
        yf_sym = YFINANCE_MAP.get(sym_upper, sym_upper)
        session = "regular"
        try:
            yf_price, yf_change, yf_session = await loop.run_in_executor(
                None, _yfinance_quote, yf_sym
            )
            if price is None and yf_price is not None:
                price = yf_price
                data_source = "yfinance"
                session = yf_session
            if change_pct is None and yf_change is not None:
                change_pct = yf_change
        except Exception:
            pass

        # 3. Fallback: local DB last close (when market closed / providers unavailable)
        if price is None and sym_upper not in YFINANCE_MAP:
            db_price, db_date = _db_last_close(sym_upper)
            if db_price is not None:
                price = db_price
                data_source = "local_db"
                as_of = db_date

        if price is not None:
            entry = {
                "symbol": sym_upper,
                "name": SYMBOL_NAMES.get(sym_upper, sym_upper),
                "price": round(price, 2) if price > 10 else round(price, 4),
                "change_pct": change_pct,
            }
            if data_source == "local_db":
                entry["data_source"] = "local_db"
                if as_of:
                    entry["as_of"] = as_of
            if session != "regular":
                entry["session"] = session
            quotes.append(entry)

    return {"quotes": quotes, "market_open": market_open, "market_session": _us_market_session()}


@router.post("/scan")
async def run_scan(req: ScanRequest):
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        scan_handler = server.handlers.scan

        # Map strategy string to ScanMode
        from src.scanner.multi_strategy_scanner import ScanMode, ScanConfig, MultiStrategyScanner
        mode_map = {
            "multi": ScanMode.BEST_SIGNAL,
            "pullback": ScanMode.PULLBACK_ONLY,
            "bounce": ScanMode.BOUNCE_ONLY,
        }
        mode = mode_map.get(req.strategy, ScanMode.BEST_SIGNAL)

        # Build scanner with v2 feature flags
        scan_config = ScanConfig(
            min_score=req.min_score,
            enable_regime_v2=True,
            enable_sector_rs=True,
        )
        scanner = MultiStrategyScanner(config=scan_config)

        # Prefetch sector RS data
        try:
            await scanner.prefetch_sector_rs()
        except Exception:
            pass  # Non-critical, scan works without it

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

                    # Forward v2 signal details
                    details = sig.get("details", {})
                    sig["sector_rs_quadrant"] = details.get("sector_rs_quadrant")
                    sig["sector_rs_modifier"] = details.get("sector_rs_modifier")
                    sig["regime_v2_label"] = details.get("regime_v2_label")
                    sig["regime_v2_min_score"] = details.get("regime_v2_min_score")
        except Exception:
            pass  # enrichment failure should not break scan results

        return scan_dict
    except Exception as e:
        return _error(str(e))


def _detect_falling_knife(
    prices: list[float],
    volumes: list[int],
    highs: list[float],
) -> dict | None:
    """
    Detect falling knife conditions based on literature criteria:
    1. Drawdown from 20-day high > 10%
    2. Consecutive down days >= 4
    3. RSI < 25 and falling (no divergence forming)
    4. Volume spike on down days > 2x average
    5. Below SMA 20 AND SMA 50

    Returns None if no falling knife detected, otherwise a dict with details.
    """
    if len(prices) < 50:
        return None

    recent = prices[-20:]
    current = prices[-1]

    # 1. Drawdown from 20-day high
    high_20d = max(highs[-20:]) if len(highs) >= 20 else max(recent)
    drawdown_pct = (high_20d - current) / high_20d * 100

    # 2. Consecutive down days (from most recent backwards)
    consec_down = 0
    for i in range(len(prices) - 1, 0, -1):
        if prices[i] < prices[i - 1]:
            consec_down += 1
        else:
            break

    # 3. RSI (14-period) and its direction
    rsi = None
    rsi_falling = False
    if len(prices) >= 15:
        gains, losses = [], []
        for i in range(len(prices) - 14, len(prices)):
            delta = prices[i] - prices[i - 1]
            gains.append(max(0, delta))
            losses.append(max(0, -delta))
        avg_gain = sum(gains) / 14
        avg_loss = sum(losses) / 14
        if avg_loss > 0:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
        else:
            rsi = 100.0

        # Check if RSI is falling (compare current vs 5 days ago)
        if len(prices) >= 20:
            gains5, losses5 = [], []
            for i in range(len(prices) - 19, len(prices) - 5):
                delta = prices[i] - prices[i - 1]
                gains5.append(max(0, delta))
                losses5.append(max(0, -delta))
            if len(gains5) >= 14:
                ag5 = sum(gains5[:14]) / 14
                al5 = sum(losses5[:14]) / 14
                rsi_prev = 100 - (100 / (1 + ag5 / al5)) if al5 > 0 else 100
                rsi_falling = rsi is not None and rsi_prev is not None and rsi < rsi_prev

    # 4. Volume spike on recent down days
    vol_spike = False
    vol_ratio = 0.0
    if len(volumes) >= 25:
        avg_vol = sum(volumes[-25:-5]) / 20
        if avg_vol > 0:
            # Average volume of last 3 days
            recent_down_vols = []
            for i in range(-3, 0):
                if prices[i] < prices[i - 1]:
                    recent_down_vols.append(volumes[i])
            if recent_down_vols:
                vol_ratio = (sum(recent_down_vols) / len(recent_down_vols)) / avg_vol
                vol_spike = vol_ratio >= 2.0

    # 5. Below SMA 20 and SMA 50
    sma_20 = sum(prices[-20:]) / 20
    sma_50 = sum(prices[-50:]) / 50 if len(prices) >= 50 else None
    below_smas = current < sma_20 and (sma_50 is not None and current < sma_50)

    # Scoring: count how many criteria are met
    triggers = []
    if drawdown_pct >= 10:
        triggers.append(f"Drawdown {drawdown_pct:.1f}% from 20d high")
    if consec_down >= 4:
        triggers.append(f"{consec_down} consecutive down days")
    if rsi is not None and rsi < 25 and rsi_falling:
        triggers.append(f"RSI {rsi:.1f} and falling")
    if vol_spike:
        triggers.append(f"Volume spike {vol_ratio:.1f}x avg on down days")
    if below_smas:
        triggers.append("Below SMA 20 & SMA 50")

    # Need at least 3 of 5 criteria for falling knife
    if len(triggers) >= 3:
        severity = "severe" if len(triggers) >= 4 else "warning"
        return {
            "detected": True,
            "severity": severity,
            "triggers": triggers,
            "drawdown_pct": round(drawdown_pct, 1),
            "consecutive_down_days": consec_down,
            "rsi": round(rsi, 1) if rsi else None,
            "volume_ratio": round(vol_ratio, 1),
            "below_sma20": current < sma_20,
            "below_sma50": sma_50 is not None and current < sma_50,
        }

    return None


@router.get("/analyze/{symbol}")
async def analyze_symbol(symbol: str):
    symbol = validate_symbol(symbol)
    server = await get_server()
    if not server:
        return _error("OptionPlay server not available")

    try:
        symbol = symbol.upper()
        scan_handler = server.handlers.scan

        # Get quote for current price (IBKR Gateway → local DB fallback)
        price = None
        price_source = "live"
        ibkr_q = await _fetch_ibkr_quotes([symbol])
        if ibkr_q and symbol in ibkr_q:
            price = ibkr_q[symbol]["price"]
        if price is None:
            db_price, _ = _db_last_close(symbol)
            if db_price is not None:
                price = db_price
                price_source = "local_db"

        # Run multi-strategy analysis (returns signals directly)
        scanner = scan_handler._get_multi_scanner(
            min_score=0, exclude_earnings_within_days=0
        )
        historical = await scan_handler._fetch_historical_cached(symbol, days=260)
        if historical is None:
            return _error(f"No historical data for {symbol}")

        prices, volumes, highs, lows = historical[0], historical[1], historical[2], historical[3]
        opens = historical[4] if len(historical) > 4 else None

        # Pre-compute market context from SPY (same as scan_async does)
        market_context_score = None
        market_context_trend = None
        try:
            spy_data = await scan_handler._fetch_historical_cached("SPY", days=260)
            if spy_data and len(spy_data[0]) >= 50:
                from src.analyzers.feature_scoring_mixin import FeatureScoringMixin
                _scorer = FeatureScoringMixin()
                mc = _scorer._score_market_context(spy_data[0])
                market_context_score = mc[0]
                market_context_trend = mc[1]
        except Exception:
            pass

        # Build context with market data so analyzers see SPY trend
        from src.analyzers.context import AnalysisContext
        context = AnalysisContext.from_data(
            symbol, prices, volumes, highs, lows,
            opens=opens,
        )
        if market_context_score is not None:
            context.market_context_score = market_context_score
            context.market_context_trend = market_context_trend

        signals = scanner.analyze_symbol(
            symbol, prices, volumes, highs, lows,
            opens=opens, context=context,
        )
        strategies = [s.to_dict() for s in signals]

        # Get IV data
        iv_data = None
        try:
            provider = scan_handler.ibkr_provider
            if provider:
                iv = await provider.get_iv_data(symbol)
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
                vix_q = await _fetch_ibkr_quotes(["VIX"])
                vix = vix_q["VIX"]["price"] if vix_q and "VIX" in vix_q else None
                if vix is None:
                    vix, _ = _db_last_vix()
                analysis_handler = server.handlers.analysis
                regime = analysis_handler.vix_selector.get_regime(vix) if vix and analysis_handler.vix_selector else None

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
                            "mid": opt.mid,
                            "last": opt.last,
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
                import yfinance as yf
                ticker = yf.Ticker(symbol)
                raw_news = ticker.news or []
                news_data = [
                    {
                        "title": (item.get("content") or {}).get("title", ""),
                        "link": ((item.get("content") or {}).get("canonicalUrl") or {}).get("url", ""),
                        "publisher": ((item.get("content") or {}).get("provider") or {}).get("displayName", ""),
                        "published": (item.get("content") or {}).get("pubDate", ""),
                    }
                    for item in raw_news[:5]
                ]
            except Exception:
                pass

        # Fetch next earnings date from DB
        earnings_date = None
        days_to_earnings = None
        try:
            import sqlite3 as _sql
            from datetime import date as _date
            _db = os.path.expanduser("~/.optionplay/trades.db")
            _conn = _sql.connect(_db)
            row = _conn.execute(
                "SELECT MIN(earnings_date) FROM earnings_history WHERE symbol = ? AND earnings_date >= date('now')",
                (symbol,),
            ).fetchone()
            _conn.close()
            if row and row[0]:
                earnings_date = row[0]
                days_to_earnings = (_date.fromisoformat(row[0]) - _date.today()).days
        except Exception:
            pass

        # ── Falling Knife Detection ──
        falling_knife = _detect_falling_knife(prices, volumes, highs)

        resp = {
            "symbol": symbol,
            "price": price,
            "strategies": strategies,
            "iv": iv_data,
            "levels": levels,
            "recommendation": recommendation,
            "news": enrich_news_sentiment(news_data),
            "analysts": analysts_data,
            "earnings_date": earnings_date,
            "days_to_earnings": days_to_earnings,
            "falling_knife": falling_knife,
            "market_open": _is_us_market_open(),
        }
        if price_source == "local_db":
            resp["price_source"] = "local_db"
        return resp
    except Exception as e:
        return _error(str(e))


@router.get("/news/{symbol}")
@limiter.limit("30/minute")
async def get_news(request: Request, symbol: str, count: int = 5):
    symbol = validate_symbol(symbol)

    # Try IBKR TWS first (direct sync connection)
    try:
        ibkr_news = await _fetch_ibkr_news(symbol, days=5, count=count)
        if ibkr_news:
            return {"symbol": symbol, "source": "ibkr", "news": enrich_news_sentiment(ibkr_news)}
    except Exception:
        pass

    # Fallback to yfinance
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        raw_news = ticker.news or []
        news = [
            {
                "title": (item.get("content") or {}).get("title", ""),
                "link": ((item.get("content") or {}).get("canonicalUrl") or {}).get("url", ""),
                "publisher": ((item.get("content") or {}).get("provider") or {}).get("displayName", ""),
                "published": (item.get("content") or {}).get("pubDate", ""),
            }
            for item in raw_news[:count]
        ]
        return {
            "symbol": symbol,
            "source": "yfinance",
            "news": enrich_news_sentiment(news) or [],
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

        # Enrich with live underlying prices from IBKR Gateway
        open_symbols = list({
            p["symbol"] for p in positions
            if p.get("status") == "open" and p.get("strategy") != "Stock"
        })
        underlying_prices = {}
        if open_symbols:
            # Fetch quotes via yfinance (avoids IBKR clientId conflicts with polling loop)
            loop = asyncio.get_event_loop()
            for sym in open_symbols:
                try:
                    yf_price, _, _ = await loop.run_in_executor(None, _yfinance_quote, sym)
                    if yf_price:
                        underlying_prices[sym] = yf_price
                except Exception:
                    pass

            # Fallback: local DB last close for any missing
            for sym in open_symbols:
                if sym not in underlying_prices:
                    close, _ = _db_last_close(sym)
                    if close:
                        underlying_prices[sym] = close

        for p in positions:
            sym = p.get("symbol")
            price = underlying_prices.get(sym)
            if price and p.get("status") == "open":
                p["underlying_price"] = round(price, 2)

                # Breakeven + Distance
                short_s = p.get("short_strike")
                long_s = p.get("long_strike")
                nc = p.get("net_credit")
                debit = p.get("debit")
                strategy = (p.get("strategy") or "").lower()

                if short_s and nc and nc > 0:
                    # Credit spread: breakeven = short_strike - credit
                    p["breakeven"] = round(short_s - nc, 2)
                    p["distance_pct"] = round((price - short_s) / price * 100, 1)
                elif "long call" in strategy and long_s:
                    # Long call: breakeven = strike + avg_cost/100
                    avg = p.get("avg_cost_per_share") or (debit if debit else None)
                    if avg:
                        p["breakeven"] = round(long_s + avg, 2)
                        p["distance_pct"] = round((price - long_s) / price * 100, 1)

                # % of max profit captured (from unrealized P&L)
                upnl = p.get("unrealized_pnl", 0) or 0
                mp = p.get("max_profit", 0) or 0
                if mp > 0:
                    p["pnl_pct_of_max"] = round(upnl / mp * 100, 1)
                elif upnl != 0 and debit:
                    # Long positions: % of cost basis
                    cost = abs(debit) * (p.get("contracts", 1)) * 100
                    if cost > 0:
                        p["pnl_pct_of_max"] = round(upnl / cost * 100, 1)

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


# ──────────────────────────────────────────────────────────
# Market Overview Endpoints
# ──────────────────────────────────────────────────────────

EVENT_DESCRIPTIONS = {
    "fed_meeting": "Federal Reserve interest rate decision & press conference",
    "cpi": "Consumer Price Index — key inflation gauge",
    "nfp": "Non-Farm Payrolls — monthly employment data",
    "opex": "Monthly options expiration (3rd Friday)",
    "ppi": "Producer Price Index — wholesale inflation",
    "gdp": "GDP release — economic growth data",
    "retail_sales": "Retail Sales — consumer spending data",
    "fed_minutes": "FOMC Meeting Minutes release",
}


@router.get("/events")
async def get_events(days: int = 30):
    """Upcoming macro events with descriptions."""
    try:
        from datetime import date, timedelta
        from src.indicators.events import get_macro_events

        today = date.today()
        events = get_macro_events(
            start_date=today, end_date=today + timedelta(days=days)
        )
        result = []
        for ev in events:
            ev_type = ev.event_type.value
            result.append({
                "date": ev.event_date.isoformat(),
                "days_away": (ev.event_date - today).days,
                "name": ev.description,
                "description": EVENT_DESCRIPTIONS.get(ev_type, ""),
                "impact": ev.impact.name if hasattr(ev.impact, "name") else str(ev.impact),
                "type": ev_type,
            })
        return {"events": result}
    except Exception as e:
        return _error(str(e))


@router.get("/sectors")
async def get_sectors():
    """Sector relative strength — RRG quadrant analysis (v2)."""
    # Try v2 SectorRSService first
    try:
        from src.services.sector_rs import SectorRSService
        from src.data_providers.local_db import LocalDBProvider

        provider = LocalDBProvider()
        service = SectorRSService(provider=provider)
        sectors = await service.get_all_sector_rs_with_trail()

        result = []
        for name, data in sorted(sectors.items(), key=lambda x: x[1]["rs_ratio"], reverse=True):
            result.append({
                "sector": data["sector"],
                "etf": data["etf_symbol"],
                "rs_ratio": data["rs_ratio"],
                "rs_momentum": data["rs_momentum"],
                "quadrant": data["quadrant"],
                "score_modifier": data["score_modifier"],
                "trail": data.get("trail", []),
            })
        return {"sectors": result, "version": "v2"}
    except Exception as e:
        return _error(str(e))


@router.get("/stock-rs")
async def get_stock_rs(sector: str = None, exclude_earnings_days: int = 0):
    """Stock relative strength — RRG for top liquid stocks vs SPY."""
    try:
        from src.services.sector_rs import SectorRSService
        from src.data_providers.local_db import LocalDBProvider

        provider = LocalDBProvider()
        service = SectorRSService(provider=provider)
        # Overfetch when filtering earnings so we can backfill
        fetch_limit = 25 if exclude_earnings_days > 0 else 10
        stocks = await service.get_stock_rs_with_trail(limit=fetch_limit, sector=sector)

        # Filter out stocks with earnings within N days
        if exclude_earnings_days > 0:
            from datetime import date as _date
            from src.cache import get_earnings_history_manager
            em = get_earnings_history_manager()
            filtered = []
            for data in stocks:
                nxt = em.get_next_future_earnings(data["symbol"], search_days=exclude_earnings_days)
                if nxt is None:
                    filtered.append(data)
                else:
                    days_to = (nxt.earnings_date - _date.today()).days
                    if days_to > exclude_earnings_days:
                        filtered.append(data)
            stocks = filtered

        # Build industry lookup from fundamentals
        industry_map = {}
        try:
            from src.cache import get_fundamentals_manager
            fm = get_fundamentals_manager()
            for data in stocks:
                f = fm.get_fundamentals(data["symbol"])
                if f and f.industry:
                    industry_map[data["symbol"]] = f.industry
        except Exception:
            pass

        result = []
        for data in sorted(stocks, key=lambda x: x["rs_ratio"], reverse=True)[:10]:
            result.append({
                "symbol": data["symbol"],
                "sector": data["sector"],
                "industry": industry_map.get(data["symbol"]),
                "rs_ratio": data["rs_ratio"],
                "rs_momentum": data["rs_momentum"],
                "quadrant": data["quadrant"],
                "trail": data.get("trail", []),
                "days_to_earnings": None,
            })

        # Attach days-to-earnings for display
        if result:
            from datetime import date as _date
            from src.cache import get_earnings_history_manager
            em = get_earnings_history_manager()
            for r in result:
                nxt = em.get_next_future_earnings(r["symbol"], search_days=90)
                if nxt:
                    r["days_to_earnings"] = (nxt.earnings_date - _date.today()).days

        return {"stocks": result}
    except Exception as e:
        return _error(str(e))


@router.get("/earnings-calendar")
async def get_earnings_calendar(count: int = 5):
    """Next upcoming earnings from watchlist — reads from local DB (earnings_history)."""
    try:
        from datetime import date
        import sqlite3
        from pathlib import Path

        db_path = Path.home() / ".optionplay" / "trades.db"
        if not db_path.exists():
            return _error("trades.db not found")

        today = date.today()

        # Get watchlist symbols
        watchlist = set()
        try:
            from src.config.watchlist_loader import WatchlistLoader
            loader = WatchlistLoader()
            watchlist = set(loader.get_all_symbols())
        except Exception:
            pass

        conn = sqlite3.connect(db_path)
        try:
            if watchlist:
                placeholders = ",".join("?" * len(watchlist))
                rows = conn.execute(
                    f"""
                    SELECT symbol, MIN(earnings_date) as next_date
                    FROM earnings_history
                    WHERE earnings_date >= ?
                      AND symbol IN ({placeholders})
                    GROUP BY symbol
                    ORDER BY next_date ASC
                    LIMIT ?
                    """,
                    [today.isoformat()] + list(watchlist) + [count],
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT symbol, MIN(earnings_date) as next_date
                    FROM earnings_history
                    WHERE earnings_date >= ?
                    GROUP BY symbol
                    ORDER BY next_date ASC
                    LIMIT ?
                    """,
                    [today.isoformat(), count],
                ).fetchall()
        finally:
            conn.close()

        earnings_list = []
        for symbol, e_date_str in rows:
            e_date = date.fromisoformat(e_date_str)
            days_away = (e_date - today).days
            status = "safe" if days_away > 45 else "caution" if days_away > 14 else "danger"
            earnings_list.append({
                "symbol": symbol,
                "date": e_date_str,
                "days_away": days_away,
                "status": status,
            })

        return {"earnings": earnings_list}
    except Exception as e:
        return _error(str(e))


@router.post("/shadow-log")
async def log_shadow_trade(req: ShadowLogRequest):
    """Log a shadow trade from the scanner UI.

    Mirrors the daily_picks shadow-logging logic in scan_composed.py:
    1. Settings check (enabled, auto_log_min_score)
    2. Strategy name mapping
    3. Tradability check against live options chain (if IBKR available)
    4. log_trade() on success, log_rejection() on failure
    5. VIX + regime attached automatically
    """
    import sys
    optionplay_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
    )
    if optionplay_dir not in sys.path:
        sys.path.insert(0, optionplay_dir)

    from src.shadow_tracker import ShadowTracker, check_tradability

    # ── Settings check ──
    try:
        settings = ShadowTracker._load_settings_static()
        if not settings.get("enabled", True):
            return {"trade_id": None, "status": "disabled"}
    except Exception:
        pass

    # ── Strategy name mapping (frontend display → backend enum) ──
    strategy_map = {
        "pullback": "pullback",
        "bounce": "bounce",
        "support bounce": "bounce",
    }
    strategy = strategy_map.get(
        req.strategy.lower(), req.strategy.lower().replace(" ", "_")
    )
    symbol = req.symbol.upper()

    # ── VIX + Regime (v2) ──
    vix_at_log = None
    regime_at_log = None
    try:
        vix_q = await _fetch_ibkr_quotes(["VIX"])
        if vix_q and "VIX" in vix_q:
            vix_at_log = vix_q["VIX"]["price"]
        if vix_at_log is None:
            vix_at_log, _ = _db_last_vix()
        if vix_at_log is not None:
            try:
                from src.services.vix_regime import _classify_regime
                regime_at_log = _classify_regime(vix_at_log).value
            except ImportError:
                pass
    except Exception:
        pass

    # ── Tradability check against live chain ──
    tradeable = True
    rejection_reason = None
    chain_details = {}
    try:
        server = await get_server()  # noqa: F821
        handler = server.handlers.analysis if server else None
        if handler and handler.ibkr_connected:
            provider = handler.ibkr_provider
            if provider and req.expiration:
                tradeable, rejection_reason, chain_details = await check_tradability(
                    provider, symbol, req.expiration,
                    req.short_strike, req.long_strike,
                )
    except Exception:
        # Tradability check failed — log with estimated data anyway
        tradeable = True
        chain_details = {}

    # ── Serialize trade context ──
    context_json = None
    if req.trade_context:
        import json as _json2
        try:
            context_json = _json2.dumps(req.trade_context, default=str)
        except Exception:
            pass

    tracker = ShadowTracker()
    try:
        if tradeable:
            trade_id = tracker.log_trade(
                source="scan",
                symbol=symbol,
                strategy=strategy,
                score=req.score,
                enhanced_score=req.enhanced_score,
                liquidity_tier=req.liquidity_tier,
                short_strike=req.short_strike,
                long_strike=req.long_strike,
                spread_width=req.spread_width,
                est_credit=chain_details.get("net_credit", req.est_credit),
                expiration=req.expiration,
                dte=req.dte,
                short_bid=chain_details.get("short_bid"),
                short_ask=chain_details.get("short_ask"),
                short_oi=chain_details.get("short_oi"),
                long_bid=chain_details.get("long_bid"),
                long_ask=chain_details.get("long_ask"),
                long_oi=chain_details.get("long_oi"),
                price_at_log=req.price_at_log,
                vix_at_log=vix_at_log,
                regime_at_log=regime_at_log,
                stability_at_log=req.stability_at_log,
                trade_context=context_json,
            )

            if trade_id:
                return {
                    "trade_id": trade_id,
                    "status": "logged",
                    "credit": chain_details.get("net_credit", req.est_credit),
                }
            else:
                return {"trade_id": None, "status": "duplicate"}
        else:
            # Not tradeable — log rejection
            import json as _json
            tracker.log_rejection(
                source="scan",
                symbol=symbol,
                strategy=strategy,
                score=req.score,
                liquidity_tier=req.liquidity_tier,
                short_strike=req.short_strike,
                long_strike=req.long_strike,
                rejection_reason=rejection_reason or "not_tradeable",
                actual_credit=chain_details.get("net_credit"),
                short_oi=chain_details.get("short_oi"),
                details=_json.dumps(chain_details),
            )
            return {
                "trade_id": None,
                "status": "rejected",
                "reason": rejection_reason,
            }
    except ValueError as e:
        return JSONResponse({"error": str(e)}, status_code=400)
    except Exception as e:
        return _error(str(e), status=500)
    finally:
        tracker.close()


@router.get("/shadow-review")
async def shadow_review(
    days_back: int = 30,
    status_filter: str = "all",
    strategy_filter: str = "",
):
    """Shadow trade review — list trades with filtering."""
    import sys
    optionplay_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
    )
    if optionplay_dir not in sys.path:
        sys.path.insert(0, optionplay_dir)

    from src.shadow_tracker import ShadowTracker

    tracker = ShadowTracker()
    try:
        trades = tracker.get_trades(
            days_back=days_back,
            status_filter=status_filter if status_filter else "all",
            strategy_filter=strategy_filter if strategy_filter else None,
        )
        return {"trades": trades, "count": len(trades)}
    except Exception as e:
        return _error(str(e), status=500)
    finally:
        tracker.close()


@router.get("/shadow-stats")
async def shadow_stats(group_by: str = "strategy", min_trades: int = 5):
    """Aggregated shadow trade statistics."""
    import sys
    optionplay_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
    )
    if optionplay_dir not in sys.path:
        sys.path.insert(0, optionplay_dir)

    from src.shadow_tracker import ShadowTracker, get_stats

    tracker = ShadowTracker()
    try:
        stats = get_stats(tracker, group_by=group_by, min_trades=min_trades)
        return {"stats": stats}
    except ValueError as e:
        return _error(str(e), status=400)
    except Exception as e:
        return _error(str(e), status=500)
    finally:
        tracker.close()


@router.get("/market-news")
async def get_market_news(count: int = 5):
    """Top market news headlines (SPY-based)."""
    try:
        # Try IBKR first
        try:
            ibkr_news = await _fetch_ibkr_news("SPY", days=3, count=count)
            if ibkr_news:
                return {"news": enrich_news_sentiment(ibkr_news), "source": "ibkr"}
        except Exception:
            pass

        # Fallback: yfinance
        import yfinance as yf
        ticker = yf.Ticker("SPY")
        raw_news = ticker.news or []
        news = [
            {
                "title": (item.get("content") or {}).get("title", ""),
                "link": ((item.get("content") or {}).get("canonicalUrl") or {}).get("url", ""),
                "publisher": ((item.get("content") or {}).get("provider") or {}).get("displayName", ""),
                "published": (item.get("content") or {}).get("pubDate", ""),
            }
            for item in raw_news[:count]
        ]
        return {"news": enrich_news_sentiment(news) or [], "source": "yfinance"}
    except Exception as e:
        return _error(str(e))
