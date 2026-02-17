from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import routes, admin, json_routes

app = FastAPI(title="OptionPlay Web API", version="1.0.0")

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
