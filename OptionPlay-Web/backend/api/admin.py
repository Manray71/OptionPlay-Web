import os
import shutil
import sqlite3
import subprocess
import sys
from datetime import date

import yaml
from fastapi import APIRouter, Body, Depends, HTTPException, Request

from ..rate_limit import limiter
from .auth import require_admin_key

# Path to OptionPlay config
# Assumes standard sibling directory structure
CONFIG_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../OptionPlay/config")
)

# All admin routes require authentication
router = APIRouter(dependencies=[Depends(require_admin_key)])

CONFIG_FILES = {
    "trading": "trading.yaml",
    "scoring": "scoring.yaml",
    "system": "system.yaml",
    "watchlists": "watchlists.yaml",
}

# =============================================================================
# DB UPDATE — Run scripts/DBupdate.py
# (Must be defined BEFORE the catch-all /{file_key} routes)
# =============================================================================
OPTIONPLAY_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../../OptionPlay")
)
DBUPDATE_SCRIPT = os.path.join(OPTIONPLAY_ROOT, "scripts", "DBupdate.py")
FUNDAMENTALS_SCRIPT = os.path.join(
    OPTIONPLAY_ROOT, "scripts", "populate_fundamentals.py"
)
DB_PATH = os.path.expanduser("~/.optionplay/trades.db")


@router.post("/db-update")
@limiter.limit("5/minute")
async def run_db_update(request: Request, payload: dict = Body(default={})):
    """
    Run DBupdate.py with optional step selection.
    Payload:
      steps: list of steps ["vix", "options", "ohlcv"] (default: all)
      dry_run: bool (default: false)
    """
    steps = payload.get("steps", ["vix", "options", "ohlcv"])
    dry_run = payload.get("dry_run", False)

    if not os.path.exists(DBUPDATE_SCRIPT):
        raise HTTPException(status_code=404, detail="DBupdate.py not found")

    cmd = [sys.executable, DBUPDATE_SCRIPT]

    valid_steps = [s for s in steps if s in ("vix", "options", "ohlcv")]
    if valid_steps:
        cmd.append("--steps")
        cmd.extend(valid_steps)

    if dry_run:
        cmd.append("--dry-run")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
            cwd=OPTIONPLAY_ROOT,
        )
        return {
            "status": "completed" if result.returncode == 0 else "error",
            "returncode": result.returncode,
            "stdout": result.stdout[-5000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "message": "DB update timed out after 10 minutes",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/db-status")
async def get_db_status():
    """Get the current DB status (last update dates, row counts)."""
    try:
        sys.path.insert(0, OPTIONPLAY_ROOT)
        result = subprocess.run(
            [sys.executable, DBUPDATE_SCRIPT, "--status"],
            capture_output=True,
            text=True,
            timeout=30,
            cwd=OPTIONPLAY_ROOT,
        )
        return {
            "status": "ok" if result.returncode == 0 else "error",
            "output": result.stdout,
        }
    except Exception as e:
        return {"status": "error", "output": str(e)}


@router.get("/db-coverage")
async def get_db_coverage():
    """Structured coverage stats for all data tables, queried directly from SQLite."""
    try:
        conn = sqlite3.connect(DB_PATH)
        today = date.today().isoformat()

        def days_stale(last_date_str):
            if not last_date_str:
                return None
            return (date.today() - date.fromisoformat(last_date_str[:10])).days

        def badge(days):
            if days is None:
                return "red"
            if days <= 1:
                return "green"
            if days <= 3:
                return "amber"
            return "red"

        # VIX
        r = conn.execute("SELECT MAX(date), COUNT(*) FROM vix_data").fetchone()
        vix_last, vix_rows = r
        vix_days = days_stale(vix_last)

        # Options
        r = conn.execute(
            "SELECT MAX(quote_date), COUNT(*), COUNT(DISTINCT underlying) FROM options_prices"
        ).fetchone()
        opt_last, opt_rows, opt_symbols = r
        opt_days = days_stale(opt_last)

        # Greeks
        r = conn.execute("SELECT COUNT(*) FROM options_greeks").fetchone()
        greeks_rows = r[0]

        # OHLCV
        r = conn.execute(
            "SELECT MAX(quote_date), COUNT(*), COUNT(DISTINCT symbol) FROM daily_prices"
        ).fetchone()
        ohlcv_last, ohlcv_rows, ohlcv_symbols = r
        ohlcv_days = days_stale(ohlcv_last)

        # Fundamentals
        r = conn.execute(
            "SELECT MAX(updated_at), COUNT(*) FROM symbol_fundamentals WHERE delisted = 0"
        ).fetchone()
        fund_last_raw, fund_rows = r
        fund_last = fund_last_raw[:10] if fund_last_raw else None
        fund_days = days_stale(fund_last)

        # Earnings
        r = conn.execute(
            "SELECT MAX(earnings_date), COUNT(*), COUNT(DISTINCT symbol) FROM earnings_history"
        ).fetchone()
        earn_max, earn_rows, earn_symbols = r
        r2 = conn.execute(
            "SELECT COUNT(DISTINCT symbol), COUNT(*) FROM earnings_history WHERE earnings_date >= ?",
            (today,),
        ).fetchone()
        earn_future_symbols, earn_future_rows = r2

        conn.close()

        return {
            "as_of": today,
            "tables": {
                "vix": {
                    "last_date": vix_last,
                    "days_stale": vix_days,
                    "badge": badge(vix_days),
                    "row_count": vix_rows,
                },
                "options": {
                    "last_date": opt_last,
                    "days_stale": opt_days,
                    "badge": badge(opt_days),
                    "row_count": opt_rows,
                    "symbol_count": opt_symbols,
                    "greeks_count": greeks_rows,
                },
                "ohlcv": {
                    "last_date": ohlcv_last,
                    "days_stale": ohlcv_days,
                    "badge": badge(ohlcv_days),
                    "row_count": ohlcv_rows,
                    "symbol_count": ohlcv_symbols,
                },
                "fundamentals": {
                    "last_date": fund_last,
                    "days_stale": fund_days,
                    "badge": badge(fund_days),
                    "row_count": fund_rows,
                },
                "earnings": {
                    "last_date": earn_max,
                    "row_count": earn_rows,
                    "symbol_count": earn_symbols,
                    "badge": "green"
                    if earn_future_symbols and earn_future_symbols > 0
                    else "amber",
                    "future_symbols": earn_future_symbols,
                    "future_events": earn_future_rows,
                },
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB coverage query failed: {e}")


@router.post("/fundamentals-update")
@limiter.limit("5/minute")
async def run_fundamentals_update(request: Request, payload: dict = Body(default={})):
    """Run populate_fundamentals.py with optional mode selection."""
    if not os.path.exists(FUNDAMENTALS_SCRIPT):
        raise HTTPException(
            status_code=404, detail="populate_fundamentals.py not found"
        )

    mode = payload.get("mode", "full")
    cmd = [sys.executable, FUNDAMENTALS_SCRIPT]

    valid_modes = {
        "yfinance-only": "--yfinance-only",
        "stability-only": "--stability-only",
        "earnings-only": "--earnings-only",
        "proxy-stability": "--proxy-stability",
    }
    if mode in valid_modes:
        cmd.append(valid_modes[mode])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,
            cwd=OPTIONPLAY_ROOT,
        )
        return {
            "status": "completed" if result.returncode == 0 else "error",
            "returncode": result.returncode,
            "stdout": result.stdout[-5000:] if result.stdout else "",
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "timeout",
            "message": "Fundamentals update timed out after 10 minutes",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CONFIG FILE ROUTES (catch-all /{file_key} must come LAST)
# =============================================================================


@router.get("/files")
async def list_config_files():
    return list(CONFIG_FILES.keys())


@router.get("/{file_key}")
async def get_config_file(file_key: str):
    if file_key not in CONFIG_FILES:
        raise HTTPException(status_code=404, detail="Config file not found")

    filename = CONFIG_FILES[file_key]
    file_path = os.path.join(CONFIG_DIR, filename)

    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=404, detail=f"File {filename} not found on disk"
        )

    with open(file_path, "r") as f:
        content = f.read()

    return {"filename": filename, "content": content}


@router.post("/{file_key}")
@limiter.limit("10/minute")
async def save_config_file(request: Request, file_key: str, payload: dict = Body(...)):
    if file_key not in CONFIG_FILES:
        raise HTTPException(status_code=404, detail="Config file not found")

    content = payload.get("content")
    if content is None:
        raise HTTPException(status_code=400, detail="Content is required")

    # Validate YAML before saving
    try:
        yaml.safe_load(content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {e}")

    filename = CONFIG_FILES[file_key]
    file_path = os.path.join(CONFIG_DIR, filename)

    # Create backup before overwriting
    if os.path.exists(file_path):
        shutil.copy2(file_path, file_path + ".bak")

    with open(file_path, "w") as f:
        f.write(content)

    try:
        sys.path.append(os.path.abspath(os.path.join(CONFIG_DIR, "../src")))
        from config.scoring_config import get_scoring_resolver

        get_scoring_resolver().reload()
    except Exception as e:
        print(f"Warning: Could not trigger hot-reload: {e}")

    return {"status": "saved", "filename": filename, "backup": True}
