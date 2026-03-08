import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

# Load .env before anything else
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from .api import routes, admin, json_routes  # noqa: E402
from .rate_limit import limiter  # noqa: E402

app = FastAPI(title="OptionPlay Web API", version="1.0.0")

# Rate limiter
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request, exc):
    return JSONResponse(
        {"error": "Rate limit exceeded. Please try again later."},
        status_code=429,
    )


# CORS - Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(routes.router, prefix="/api", tags=["General"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(json_routes.router, prefix="/api/json", tags=["JSON API"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "OptionPlay-Web Backend"}
