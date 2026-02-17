from fastapi import APIRouter, HTTPException, Body
from fastapi.responses import StreamingResponse
import yaml
import os
import sys
import subprocess
import asyncio

# Path to OptionPlay config
# Assumes standard sibling directory structure
CONFIG_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../OptionPlay/config"))

router = APIRouter()

CONFIG_FILES = {
    "weights": "scoring_weights.yaml",
    "thresholds": "analyzer_thresholds.yaml",
    "scanner": "scanner_config.yaml",
    "strategies": "strategies.yaml",
    "rules": "trading_rules.yaml",
    "settings": "settings.yaml"
}

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
        raise HTTPException(status_code=404, detail=f"File {filename} not found on disk")
        
    with open(file_path, "r") as f:
        content = f.read()
        
    return {"filename": filename, "content": content}

@router.post("/{file_key}")
async def save_config_file(file_key: str, payload: dict = Body(...)):
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
    
    with open(file_path, "w") as f:
        f.write(content)
        
    # Trigger reload if possible
    # We need access to the running server instance to trigger reload on the config resolver
    # For now, we assume the next request will pick up changes or we rely on auto-reload of the resolver logic
    # The RecursiveConfigResolver in OptionPlay has a reload() method we can call
    
    try:
        sys.path.append(os.path.abspath(os.path.join(CONFIG_DIR, "../src")))
        from config.scoring_config import get_scoring_resolver
        get_scoring_resolver().reload()
    except Exception as e:
        print(f"Warning: Could not trigger hot-reload: {e}")
        
    return {"status": "saved", "filename": filename}


# =============================================================================
# DB UPDATE — Run scripts/DBupdate.py
# =============================================================================
OPTIONPLAY_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../OptionPlay"))
DBUPDATE_SCRIPT = os.path.join(OPTIONPLAY_ROOT, "scripts", "DBupdate.py")

@router.post("/db-update")
async def run_db_update(payload: dict = Body(default={})):
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
    
    for step in steps:
        if step in ("vix", "options", "ohlcv"):
            cmd.append(f"--{step}")
    
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
            "stdout": result.stdout[-5000:] if result.stdout else "",  # Last 5K chars
            "stderr": result.stderr[-2000:] if result.stderr else "",
        }
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "message": "DB update timed out after 10 minutes"}
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

