"""FastAPI app entry point. Mounts CORS, health check, and feature routers."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.routes import router as auth_router
from database import close_db
from ideation.routes import router as ideation_router
from practice.routes import router as practice_router

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
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
