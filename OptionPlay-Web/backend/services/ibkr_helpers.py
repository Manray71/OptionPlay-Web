"""IBKR subprocess wrappers and market session helpers.

Extracted from json_routes.py so they can be reused by the polling loop.
"""

import asyncio
import json as _json
import os
import socket
import subprocess
from datetime import datetime

# ── Constants ──

DB_PATH = os.path.expanduser("~/.optionplay/trades.db")

# IBKR TWS port (default 7497 Paper; override via IBKR_PORT env var)
IBKR_HOST = "127.0.0.1"
IBKR_PORT = int(os.environ.get("IBKR_PORT", 7497))

OPTIONPLAY_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
)

SCRIPTS_DIR = os.path.join(os.path.dirname(__file__), "..", "scripts")


def _get_python():
    """Find the OptionPlay venv python."""
    python = os.path.join(OPTIONPLAY_DIR, ".venv", "bin", "python")
    if not os.path.exists(python):
        python = os.path.join(OPTIONPLAY_DIR, "venv", "bin", "python")
    if not os.path.exists(python):
        return None
    return python


def _ibkr_port_open() -> bool:
    """Quick TCP check if IBKR port is reachable."""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(2)
    result = sock.connect_ex((IBKR_HOST, IBKR_PORT))
    sock.close()
    return result == 0


# ── Market Session ──

def _us_market_session() -> str:
    """Return current US market session: 'pre_market', 'market_open', 'post_market', or 'closed'."""
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo
    et = datetime.now(ZoneInfo("America/New_York"))
    if et.weekday() >= 5:  # Sat/Sun
        return "closed"
    mins = et.hour * 60 + et.minute
    if 240 <= mins < 570:    # 4:00-9:30 ET
        return "pre_market"
    if 570 <= mins < 960:    # 9:30-16:00 ET
        return "market_open"
    if 960 <= mins < 1200:   # 16:00-20:00 ET
        return "post_market"
    return "closed"


def _is_us_market_open() -> bool:
    """Check if US stock market is currently open (Mon-Fri 9:30-16:00 ET)."""
    return _us_market_session() == "market_open"


# ── VIX Regime ──

def _vix_regime(vix: float) -> str:
    """Classify VIX into regime label using v2 canonical boundaries."""
    try:
        import sys
        if OPTIONPLAY_DIR not in sys.path:
            sys.path.insert(0, OPTIONPLAY_DIR)
        from src.services.vix_regime import _classify_regime
        return _classify_regime(vix).value
    except (ImportError, Exception):
        if vix <= 15:
            return "Low"
        if vix <= 20:
            return "Normal"
        if vix <= 25:
            return "Elevated"
        return "High"


# ── DB Helpers ──

def _db_last_close(symbol: str):
    """Fetch last closing price from daily_prices. Returns (close, date) or (None, None)."""
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT close, quote_date FROM daily_prices WHERE symbol = ? ORDER BY quote_date DESC LIMIT 1",
            (symbol,),
        ).fetchone()
        conn.close()
        if row and row[0]:
            return float(row[0]), row[1]
    except Exception:
        pass
    return None, None


def _db_last_vix():
    """Fetch last VIX value from vix_data. Returns (value, date) or (None, None)."""
    import sqlite3
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT value, date FROM vix_data ORDER BY date DESC LIMIT 1"
        ).fetchone()
        conn.close()
        if row and row[0]:
            return float(row[0]), row[1]
    except Exception:
        pass
    return None, None


# ── IBKR Subprocess Wrappers ──

def _ibkr_news_sync(symbol: str, days: int = 5, count: int = 5):
    """Fetch IBKR news via subprocess — direct TWS connection (readonly)."""
    if not _ibkr_port_open():
        return None
    python = _get_python()
    if not python:
        return None

    script_path = os.path.join(SCRIPTS_DIR, "ibkr_news.py")
    try:
        result = subprocess.run(
            [
                python, script_path,
                "--symbol", str(symbol),
                "--host", str(IBKR_HOST),
                "--port", str(int(IBKR_PORT)),
                "--days", str(int(days)),
                "--count", str(int(count)),
            ],
            capture_output=True, text=True, timeout=20,
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
    if not _ibkr_port_open():
        return None
    python = _get_python()
    if not python:
        return None

    script_path = os.path.join(SCRIPTS_DIR, "ibkr_portfolio.py")
    try:
        result = subprocess.run(
            [
                python, script_path,
                "--host", str(IBKR_HOST),
                "--port", str(int(IBKR_PORT)),
                "--optionplay-dir", OPTIONPLAY_DIR,
            ],
            capture_output=True, text=True, timeout=20,
            cwd=OPTIONPLAY_DIR,
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


def _ibkr_quotes_sync(symbols: list):
    """Fetch IBKR quotes via subprocess using OptionPlay's venv."""
    if not _ibkr_port_open():
        return None
    python = _get_python()
    if not python:
        return None

    script_path = os.path.join(SCRIPTS_DIR, "ibkr_quote.py")
    try:
        result = subprocess.run(
            [
                python, script_path,
                "--host", str(IBKR_HOST),
                "--port", str(int(IBKR_PORT)),
                "--symbols", ",".join(symbols),
            ],
            capture_output=True, text=True, timeout=15,
        )
        if result.returncode == 0 and result.stdout.strip():
            data = _json.loads(result.stdout.strip())
            return data.get("quotes", {})
    except Exception:
        pass
    return None


async def _fetch_ibkr_quotes(symbols: list):
    """Async wrapper: runs IBKR quote fetch in thread pool."""
    loop = asyncio.get_event_loop()
    try:
        return await loop.run_in_executor(None, _ibkr_quotes_sync, symbols)
    except Exception:
        return None
