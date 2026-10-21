"""Owner-scoped, cached performance reports for the latest six album recordings."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from auth.service import get_current_user
from database import get_db
from performance.service import review_performance

router = APIRouter(prefix='/api/albums', tags=['performance'])
logger = logging.getLogger(__name__)
MAX_RECORDINGS = 6
MAX_REVIEW_CHARACTERS = 16000


def usable_review(review) -> bool:
    if not isinstance(review, str) or not review.strip():
        return False
    text = review.strip().lower()
    return not text.startswith(('review unavailable', '_review failed:', 'review failed:'))


async def _album(db, album_id: str, user_id: str):
    if not ObjectId.is_valid(album_id):
        raise HTTPException(400, 'Invalid album id')
    album = await db.albums.find_one({'_id': ObjectId(album_id), 'user_id': user_id, 'deleting': {'$ne': True}})
    if album is None:
        raise HTTPException(404, 'Album not found')
    return album


async def _snapshot(db, album_id: str, user_id: str):
    cursor = db.sessions.find(
        {'album_id': album_id, 'user_id': user_id},
        {'_id': 1, 'name': 1, 'review': 1, 'created_at': 1},
    ).sort([('created_at', -1), ('_id', -1)]).limit(MAX_RECORDINGS)
    sessions = []
    async for doc in cursor:
        sessions.append({
            'id': str(doc['_id']), 'name': doc.get('name') or 'Untitled session',
            'created_at': doc['created_at'].isoformat() if doc.get('created_at') else None,
            'review': doc.get('review') or '',
        })
    sessions.reverse()
    fingerprint = hashlib.sha256(json.dumps(sessions, sort_keys=True).encode()).hexdigest()
    eligible = [session for session in sessions if usable_review(session['review'])]
    return sessions, eligible, fingerprint


def _response(album, sessions, eligible, fingerprint):
    saved = album.get('performance_report')
    stale = bool(saved and saved.get('source_fingerprint') != fingerprint)
    return {
        'report': {key: value for key, value in saved.items() if key != 'source_fingerprint'} if saved and not stale else None,
        'stale': stale,
        'recording_count': len(sessions),
        'reviewed_count': len(eligible),
        'max_recordings': MAX_RECORDINGS,
    }


@router.get('/{album_id}/performance')
async def get_performance(album_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    album = await _album(db, album_id, user['id'])
    sessions, eligible, fingerprint = await _snapshot(db, album_id, user['id'])
    return _response(album, sessions, eligible, fingerprint)


@router.post('/{album_id}/performance')
async def generate_performance(album_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    album = await _album(db, album_id, user['id'])
    sessions, eligible, fingerprint = await _snapshot(db, album_id, user['id'])
    if len(eligible) < 2:
        raise HTTPException(400, 'Add at least two recordings with coaching reviews in this album. Re-review failed takes first.')
    existing = _response(album, sessions, eligible, fingerprint)
    if existing['report']:
        return existing
    sources = [{**session, 'review': session['review'][:MAX_REVIEW_CHARACTERS]} for session in eligible]
    try:
        comparison = await review_performance(sources)
    except Exception as exc:
        logger.exception('Performance review failed')
        raise HTTPException(502, 'Performance review unavailable. Please try again.') from exc
    _, _, current_fingerprint = await _snapshot(db, album_id, user['id'])
    if current_fingerprint != fingerprint:
        raise HTTPException(409, 'Recordings changed during the comparison. Please generate it again.')
    report = {
        **comparison,
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'basis': 'saved_coaching_reviews',
        'source_fingerprint': fingerprint,
        'recordings': [{key: value for key, value in session.items() if key != 'review'} for session in eligible],
        'excluded_count': len(sessions) - len(eligible),
    }
    result = await db.albums.update_one(
        {'_id': ObjectId(album_id), 'user_id': user['id'], 'deleting': {'$ne': True}},
        {'$set': {'performance_report': report}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, 'Album not found')
    return _response({'performance_report': report}, sessions, eligible, fingerprint)
