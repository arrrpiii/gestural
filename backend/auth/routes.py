"""Auth routes: register, login, me."""
from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from auth.service import create_token, get_current_user, hash_password, verify_password
from database import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: str = Field(min_length=1, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: dict


def _public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
    }


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn) -> AuthOut:
    db = get_db()
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    doc = {
        "email": body.email.lower(),
        "name": body.name,
        "password_hash": hash_password(body.password),
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.users.insert_one(doc)
    user = await db.users.find_one({"_id": result.inserted_id})
    return AuthOut(token=create_token(str(result.inserted_id)), user=_public_user(user))


@router.post("/login", response_model=AuthOut)
async def login(body: LoginIn) -> AuthOut:
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    return AuthOut(token=create_token(str(user["_id"])), user=_public_user(user))


@router.get("/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return _public_user(user)
