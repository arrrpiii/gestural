"""FastAPI app entry point. Mounts CORS, health check, and feature routers."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from albums.routes import router as albums_router
from auth.routes import router as auth_router
from database import close_db, get_db
from auth.service import get_jwt_secret
from ideation.routes import router as ideation_router
from practice.routes import router as practice_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_jwt_secret()
    db = get_db()
    try:
        await db.users.create_index("email", unique=True)
        await db.sessions.create_index([("user_id", 1), ("album_id", 1), ("created_at", -1)])
        await db.albums.create_index([("user_id", 1), ("created_at", -1)])
        await db.ideations.create_index([("user_id", 1), ("created_at", -1)])
        yield
    finally:
        await close_db()


app = FastAPI(title="Gestural Practice API", version="0.1.0", lifespan=lifespan)

cors_origin = os.getenv("CORS_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[cors_origin, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(ideation_router)
app.include_router(practice_router)
app.include_router(albums_router)
