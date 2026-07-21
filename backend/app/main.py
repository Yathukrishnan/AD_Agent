"""Gulf Ad Intelligence — FastAPI entrypoint.

Run:  uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .api import router
from .db import init_db, close_db

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()      # create tables if the DB is configured (no-op otherwise)
    yield
    await close_db()

app = FastAPI(
    title="Gulf Ad Intelligence API",
    description="Competitor ad-intelligence — gathers & analyses competitor ads. Never generates ads.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def root():
    return {"service": "gulf-ad-intelligence", "docs": "/docs", "health": "/api/health"}
