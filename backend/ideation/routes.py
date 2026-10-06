"""Ideation routes: generate, list, fetch, delete."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import logging

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field

from ai_service import generate_ideation
from auth.service import get_current_user
from database import get_db

router = APIRouter(prefix="/api/ideation", tags=["ideation"])


class IdeationIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=2000)


class IdeationItem(BaseModel):
    text: str
    gesture: str


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "prompt": doc["prompt"],
        "items": doc.get("items", []),
        "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_ideation(
    body: IdeationIn,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    try:
        items = await generate_ideation(body.prompt)
    except Exception as exc:
        logging.getLogger(__name__).exception("Ideation failed")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Ideation unavailable. Please try again later.") from exc
    if not items:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "The model did not return any usable ideas. Try a more specific topic.",
        )
    db = get_db()
    doc = {
        "user_id": user["id"],
        "prompt": body.prompt,
        "items": items,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.ideations.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@router.get("")
async def list_ideations(user: dict = Depends(get_current_user)) -> list[dict[str, Any]]:
    db = get_db()
    cursor = db.ideations.find({"user_id": user["id"]}).sort("created_at", -1)
    return [_serialize(d) async for d in cursor]


@router.get("/{ideation_id}")
async def get_ideation(
    ideation_id: str,
    user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    if not ObjectId.is_valid(ideation_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    doc = await db.ideations.find_one(
        {"_id": ObjectId(ideation_id), "user_id": user["id"]}
    )
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ideation not found")
    return _serialize(doc)


@router.delete("/{ideation_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def delete_ideation(
    ideation_id: str,
    user: dict = Depends(get_current_user),
) -> Response:
    if not ObjectId.is_valid(ideation_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid id")
    db = get_db()
    result = await db.ideations.delete_one(
        {"_id": ObjectId(ideation_id), "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ideation not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
