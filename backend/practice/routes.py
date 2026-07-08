"""Practice session routes: record video (upload to GridFS), review via agno,
list, fetch, stream, edit, and delete.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agno_service import review_video
from auth.service import get_current_user
from database import get_bucket, get_db
from thumbnail_service import extract_thumbnail

router = APIRouter(prefix="/api/sessions", tags=["practice"])
MAX_VIDEO_BYTES = 50 * 1024 * 1024  # 50MB ceiling for GridFS upload.


class SessionUpdateIn(BaseModel):
    name: str | None = None


def _serialize_session(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name") or "",
        "ideation_id": doc.get("ideation_id"),
        "album_id": doc.get("album_id"),
        "review": doc.get("review", ""),
        "thumbnail": doc.get("thumbnail"),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
        "video_url": f"/api/sessions/{doc['_id']}/video",
    }


async def _attach_ideation(session: dict[str, Any], db) -> dict[str, Any]:
    """If the session has an ideation_id, embed the ideation items for display."""
    serialized = _serialize_session(session)
    ideation_id = session.get("ideation_id")
    if ideation_id and ObjectId.is_valid(str(ideation_id)):
        ide = await db.ideations.find_one({"_id": ObjectId(str(ideation_id))})
        if ide:
            serialized["ideation"] = {
                "id": str(ide["_id"]),
                "prompt": ide.get("prompt", ""),
                "items": ide.get("items", []),
            }
    return serialized


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session(
    video: UploadFile = File(...),
    ideation_id: str | None = Form(default=None),
    name: str | None = Form(default=None),
    album_id: str = Form(...),
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "File must be a video")

    bucket = get_bucket()
    db = get_db()

    # Every session must belong to an album the user owns.
    if not ObjectId.is_valid(album_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid album id")
    album = await db.albums.find_one(
        {"_id": ObjectId(album_id), "user_id": user["id"]}
    )
    if album is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Album not found")

    ideation_context: str | None = None
    if ideation_id and ObjectId.is_valid(ideation_id):
        ide = await db.ideations.find_one(
            {"_id": ObjectId(ideation_id), "user_id": user["id"]}
        )
        if ide:
            lines = [
                f"- {item['text']} (gesture: {item['gesture']})"
                for item in ide.get("items", [])
                if isinstance(item, dict)
            ]
            if lines:
                ideation_context = f"Topic: {ide.get('prompt','')}\n" + "\n".join(lines)

    video_bytes = await video.read()
    if len(video_bytes) > MAX_VIDEO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Video too large")

    # Upload to GridFS first; if review or thumbnail fails we still have the file.
    file_id = await bucket.upload_from_stream(
        video.filename or "recording.webm",
        video_bytes,
        metadata={
            "user_id": user["id"],
            "content_type": video.content_type,
        },
    )

    review = ""
    try:
        review = await review_video(video_bytes, video.content_type, ideation_context)
    except Exception as exc:  # noqa: BLE001
        review = f"_Review failed: {exc}_"

    # Thumbnail extraction is best-effort — failure leaves thumbnail=None.
    thumbnail = await extract_thumbnail(video_bytes, video.content_type)

    clean_name = (name or "").strip()[:80] or None

    doc = {
        "user_id": user["id"],
        "video_id": file_id,
        "ideation_id": ideation_id,
        "album_id": album_id,
        "name": clean_name,
        "review": review,
        "thumbnail": thumbnail,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.sessions.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _attach_ideation(doc, db)


@router.post("/{session_id}/re-review", status_code=status.HTTP_200_OK)
async def re_review_session(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Re-run the agno review on an existing session's video.

    Useful for upgrading reviews from the old text-only format to the new
    timestamped format, or for getting fresh feedback after the prompt changes.
    The stored video bytes are loaded from GridFS and re-uploaded through agno;
    nothing else about the session is touched.
    """
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    bucket = get_bucket()
    doc = await db.sessions.find_one(
        {"_id": ObjectId(session_id), "user_id": user["id"]}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    file_id = doc.get("video_id")
    if not file_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Session has no video to review")

    try:
        grid_out = await bucket.open_download_stream(ObjectId(str(file_id)))
        video_bytes = await grid_out.read()
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Could not read video from storage: {exc}",
        ) from exc

    content_type = (grid_out.metadata or {}).get("content_type", "video/webm")

    ideation_context: str | None = None
    ideation_id = doc.get("ideation_id")
    if ideation_id and ObjectId.is_valid(str(ideation_id)):
        ide = await db.ideations.find_one({"_id": ObjectId(str(ideation_id))})
        if ide:
            lines = [
                f"- {item['text']} (gesture: {item['gesture']})"
                for item in ide.get("items", [])
                if isinstance(item, dict)
            ]
            if lines:
                ideation_context = f"Topic: {ide.get('prompt','')}\n" + "\n".join(lines)

    try:
        review = await review_video(video_bytes, content_type, ideation_context)
    except Exception as exc:  # noqa: BLE001
        review = f"_Review failed: {exc}_"

    await db.sessions.update_one(
        {"_id": ObjectId(session_id)},
        {"$set": {"review": review}},
    )
    doc["review"] = review
    return await _attach_ideation(doc, db)


@router.get("")
async def list_sessions(user: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    db = get_db()
    cursor = db.sessions.find({"user_id": user["id"]}).sort("created_at", -1)
    return [_serialize_session(d) async for d in cursor]


@router.get("/{session_id}")
async def get_session(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    doc = await db.sessions.find_one(
        {"_id": ObjectId(session_id), "user_id": user["id"]}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return await _attach_ideation(doc, db)


@router.get("/{session_id}/video")
async def stream_video(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    bucket = get_bucket()
    doc = await db.sessions.find_one(
        {"_id": ObjectId(session_id), "user_id": user["id"]}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")

    file_id = doc.get("video_id")
    if not file_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No video for this session")

    grid_out = await bucket.open_download_stream(ObjectId(str(file_id)))
    content_type = (grid_out.metadata or {}).get("content_type", "video/webm")

    async def iterator():
        # motor's readchunk() takes no args — chunk size is configured on the bucket.
        # It returns the next chunk bytes, or b"" when the stream is exhausted.
        while True:
            chunk = await grid_out.readchunk()
            if not chunk:
                break
            yield chunk

    return StreamingResponse(iterator(), media_type=content_type)


@router.patch("/{session_id}")
async def update_session(
    session_id: str,
    body: SessionUpdateIn,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    update = {k: v for k, v in body.model_dump(exclude_none=True).items()}
    if "name" in update:
        update["name"] = update["name"].strip()[:80] or None
    db = get_db()
    if update:
        result = await db.sessions.update_one(
            {"_id": ObjectId(session_id), "user_id": user["id"]},
            {"$set": update},
        )
        if result.matched_count == 0:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    doc = await db.sessions.find_one(
        {"_id": ObjectId(session_id), "user_id": user["id"]}
    )
    return await _attach_ideation(doc, db)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_session(
    session_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    bucket = get_bucket()
    doc = await db.sessions.find_one(
        {"_id": ObjectId(session_id), "user_id": user["id"]}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    video_id = doc.get("video_id")
    if video_id:
        try:
            await bucket.delete(ObjectId(str(video_id)))
        except Exception:  # noqa: BLE001
            pass
    await db.sessions.delete_one({"_id": ObjectId(session_id)})
    return Response(status_code=status.HTTP_204_NO_CONTENT)