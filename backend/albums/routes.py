"""Album routes: group practice sessions by pitch. Cascade-deletes videos
and AI feedback when an album is removed.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from gridfs.errors import NoFile
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from auth.service import get_current_user
from database import get_bucket, get_db

router = APIRouter(prefix="/api/albums", tags=["albums"])
MAX_NAME_LEN = 80


class AlbumCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class AlbumUpdateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


def _clean_name(raw: str | None) -> str:
    name = (raw or "").strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name is required")
    if len(name) > MAX_NAME_LEN:
        name = name[:MAX_NAME_LEN]
    return name


async def _serialize_album(doc: dict[str, Any], user_id: str) -> dict[str, Any]:
    """Build the public album shape, including computed session_count and the
    thumbnail of the most recent session (the album's cover).
    """
    album_id = str(doc["_id"])
    db = get_db()
    latest = await db.sessions.find_one(
        {"album_id": album_id, "user_id": user_id},
        sort=[("created_at", -1)],
    )
    session_count = await db.sessions.count_documents(
        {"album_id": album_id, "user_id": user_id}
    )
    return {
        "id": album_id,
        "name": doc.get("name", ""),
        "created_at": doc["created_at"].isoformat()
        if doc.get("created_at")
        else None,
        "session_count": session_count,
        "latest_thumbnail": latest.get("thumbnail") if latest else None,
        "latest_session_id": str(latest["_id"]) if latest else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_album(
    body: AlbumCreateIn,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    db = get_db()
    doc = {
        "user_id": user["id"],
        "name": _clean_name(body.name),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.albums.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _serialize_album(doc, user["id"])


@router.get("")
async def list_albums(user: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    db = get_db()
    cursor = db.albums.find({"user_id": user["id"]}).sort("created_at", -1)
    return [await _serialize_album(d, user["id"]) async for d in cursor]


@router.patch("/{album_id}")
async def rename_album(
    album_id: str,
    body: AlbumUpdateIn,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not ObjectId.is_valid(album_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    new_name = _clean_name(body.name)
    result = await db.albums.update_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]},
        {"$set": {"name": new_name}},
    )
    if result.matched_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Album not found")
    doc = await db.albums.find_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]}
    )
    return await _serialize_album(doc, user["id"])


@router.delete(
    "/{album_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def delete_album(
    album_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    """Cascade delete: drop every session in the album, sweep their GridFS
    videos, then remove the album itself. Missing videos are tolerated; storage failures stop deletion so it can be retried.
    """
    if not ObjectId.is_valid(album_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    bucket = get_bucket()

    album = await db.albums.find_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]}
    )
    if album is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Album not found")

    # Prevent new recordings while the cascade is in progress (or awaiting retry).
    await db.albums.update_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]},
        {"$set": {"deleting": True}},
    )
    sessions = db.sessions.find(
        {"album_id": album_id, "user_id": user["id"]}
    )
    async for session in sessions:
        video_id = session.get("video_id")
        if video_id:
            try:
                await bucket.delete(ObjectId(str(video_id)))
            except NoFile:
                pass

        await db.sessions.delete_one({"_id": session["_id"], "user_id": user["id"]})
    await db.albums.delete_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
