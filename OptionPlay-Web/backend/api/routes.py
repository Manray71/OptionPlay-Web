from fastapi import APIRouter
from .auth import validate_symbol
import asyncio
import sys
import os

# Add parent directory to path to import OptionPlay
# This assumes OptionPlay-Web is a sibling of OptionPlay
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../OptionPlay")))

# Disable direct IBKR connections from OptionPlay handlers —
# Web backend uses subprocess for IBKR portfolio instead.
# Direct ib_insync connections trigger Gateway write-access warnings.
os.environ["OPTIONPLAY_NO_IBKR"] = "1"

# ib_insync/eventkit requires a running event loop at import time (Python 3.14+)
# and nest_asyncio for coexistence with uvicorn's event loop.
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())

import nest_asyncio
nest_asyncio.apply()

# Patch asyncio for ib_insync compatibility
try:
    import ib_insync.util
    ib_insync.util.patchAsyncio()
except Exception:
    pass

try:
    from src.mcp_server import OptionPlayServer
except ImportError as e:
    print(f"Error importing OptionPlay: {e}")
    # Mock for development if OptionPlay is missing
    OptionPlayServer = None

router = APIRouter()

# Singleton server instance
server_instance = None

async def get_server():
    global server_instance
    if server_instance is None and OptionPlayServer:
        server_instance = OptionPlayServer()
    return server_instance

@router.get("/vix")
async def get_vix():
    server = await get_server()
    if not server:
        return {"error": "OptionPlay server not available"}
    
    # Using the handler logic from mcp_tool_registry
    return await server.handlers.vix.get_strategy_recommendation()

@router.get("/quote/{symbol}")
async def get_quote(symbol: str):
    symbol = validate_symbol(symbol)
    server = await get_server()
    if not server:
        return {"error": "OptionPlay server not available"}
    return await server.handlers.quote.get_quote(symbol)

@router.get("/analyze/{symbol}")
async def analyze_symbol(symbol: str):
    symbol = validate_symbol(symbol)
    server = await get_server()
    if not server:
        return {"error": "OptionPlay server not available"}
    return await server.handlers.analysis.analyze_symbol(symbol)

@router.post("/scan")
async def run_scan(criteria: dict):
    server = await get_server()
    if not server:
        return {"error": "OptionPlay server not available"}
    
    # Generic scan dispatcher
    strategy = criteria.get("strategy", "pullback")
    
    if strategy == "pullback":
        return await server.handlers.scan.scan_with_strategy(
            symbols=criteria.get("symbols"),
            min_score=criteria.get("min_score", 3.5)
        )
    elif strategy == "bounce":
         return await server.handlers.scan.scan_bounce(
            symbols=criteria.get("symbols"),
            min_score=criteria.get("min_score", 5.0)
        )
    # Add other strategies as needed
    
    return {"error": f"Unknown strategy: {strategy}"}
