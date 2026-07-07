"""MongoDB connection helpers (async, motor)."""
import os
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None
_bucket: AsyncIOMotorGridFSBucket | None = None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(os.getenv("MONGO_URL", "mongodb://localhost:27017"))
    return _client


def get_db() -> AsyncIOMotorDatabase:
    global _db
    if _db is None:
        _db = get_client()[os.getenv("MONGO_DB", "gestural")]
    return _db


def get_bucket() -> AsyncIOMotorGridFSBucket:
    """GridFS bucket for video storage."""
    global _bucket
    if _bucket is None:
        _bucket = AsyncIOMotorGridFSBucket(get_db(), bucket_name="videos")
    return _bucket


async def close_db() -> None:
    global _client, _db, _bucket
    if _client is not None:
        _client.close()
    _client = None
    _db = None
    _bucket = None
