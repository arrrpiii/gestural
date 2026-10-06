import asyncio
from datetime import datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import jwt
import pytest
from bson import ObjectId
from fastapi import HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
from starlette.datastructures import Headers

from auth import routes as auth_routes, service
from practice import routes
from ai_service import _extract_json
import main


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv('JWT_SECRET', 'test-only-secret-with-at-least-32-bytes')


@pytest.mark.parametrize('secret', ['', 'dev-secret', 'change-this-to-a-long-random-string'])
def test_insecure_secrets_rejected(monkeypatch, secret):
    monkeypatch.setenv('JWT_SECRET', secret)
    with pytest.raises(RuntimeError):
        service.get_jwt_secret()


@pytest.mark.parametrize('sub', ['invalid', '', 123, None])
def test_malformed_subject_returns_401(sub):
    token = jwt.encode({'sub': sub, 'iat': datetime.now(timezone.utc),
                        'exp': datetime.now(timezone.utc) + timedelta(minutes=1)},
                       service.get_jwt_secret(), algorithm='HS256')
    with pytest.raises(HTTPException) as error:
        run(service.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)))
    assert error.value.status_code == 401


def test_token_without_expiration_rejected():
    token = jwt.encode({'sub': str(ObjectId()), 'iat': datetime.now(timezone.utc)},
                       service.get_jwt_secret(), algorithm='HS256')
    with pytest.raises(HTTPException) as error:
        run(service.get_current_user(HTTPAuthorizationCredentials(scheme='Bearer', credentials=token)))
    assert error.value.status_code == 401


def test_passwords_cannot_silently_truncate():
    with pytest.raises(ValidationError):
        auth_routes.RegisterIn(email='a@example.com', name='A', password='é' * 37)
    hashed = service.hash_password('a' * 72)
    assert service.verify_password('a' * 72, hashed)
    assert not service.verify_password('a' * 72 + 'b', hashed)


def test_whitespace_name_rejected():
    with pytest.raises(ValidationError):
        auth_routes.RegisterIn(email='a@example.com', name='   ', password='secure123')


def test_registration_race_returns_conflict(monkeypatch):
    users = SimpleNamespace(find_one=AsyncMock(return_value=None),
                            insert_one=AsyncMock(side_effect=DuplicateKeyError('duplicate')))
    monkeypatch.setattr(auth_routes, 'get_db', lambda: SimpleNamespace(users=users))
    with pytest.raises(HTTPException) as error:
        run(auth_routes.register(auth_routes.RegisterIn(email='a@example.com', name='A', password='secure123')))
    assert error.value.status_code == 409


def test_startup_indexes_without_deleting_data(monkeypatch):
    db = MagicMock()
    for collection in [db.users, db.sessions, db.albums, db.ideations]:
        collection.create_index = AsyncMock()
    close = AsyncMock()
    monkeypatch.setattr(main, 'get_db', lambda: db)
    monkeypatch.setattr(main, 'close_db', close)
    async def start():
        async with main.lifespan(main.app):
            pass
    run(start())
    db.sessions.delete_many.assert_not_called()
    db.users.create_index.assert_awaited_once_with('email', unique=True)
    close.assert_awaited_once()


def test_embedded_ideation_is_owner_scoped(monkeypatch):
    ideations = SimpleNamespace(find_one=AsyncMock(return_value=None))
    session = {'_id': ObjectId(), 'user_id': 'owner', 'ideation_id': str(ObjectId())}
    result = run(routes._attach_ideation(session, SimpleNamespace(ideations=ideations)))
    assert 'ideation' not in result
    assert ideations.find_one.call_args.args[0]['user_id'] == 'owner'


def test_empty_patch_missing_session_returns_404(monkeypatch):
    db = SimpleNamespace(sessions=SimpleNamespace(find_one=AsyncMock(return_value=None)))
    monkeypatch.setattr(routes, 'get_db', lambda: db)
    with pytest.raises(HTTPException) as error:
        run(routes.update_session(str(ObjectId()), routes.SessionUpdateIn(), {'id': 'owner'}))
    assert error.value.status_code == 404


@pytest.fixture
def storage(monkeypatch):
    db = SimpleNamespace(albums=SimpleNamespace(find_one=AsyncMock(return_value={'name': 'Album'})),
                         ideations=SimpleNamespace(find_one=AsyncMock(return_value=None)),
                         sessions=SimpleNamespace(insert_one=AsyncMock(), find_one=AsyncMock(), update_one=AsyncMock()))
    bucket = SimpleNamespace(upload_from_stream=AsyncMock(return_value=ObjectId()), delete=AsyncMock())
    monkeypatch.setattr(routes, 'get_db', lambda: db)
    monkeypatch.setattr(routes, 'get_bucket', lambda: bucket)
    monkeypatch.setattr(routes, 'extract_thumbnail', AsyncMock(return_value=None))
    monkeypatch.setattr(routes, 'review_video', AsyncMock(return_value='Review'))
    return db, bucket


def upload(data=b'video'):
    return UploadFile(BytesIO(data), filename='recording.mp4', headers=Headers({'content-type': 'video/mp4'}))


@pytest.mark.parametrize('ideation_id', ['invalid', str(ObjectId())])
def test_unowned_or_invalid_ideation_cannot_be_linked(storage, ideation_id):
    with pytest.raises(HTTPException) as error:
        run(routes.create_session(upload(), ideation_id, None, str(ObjectId()), {'id': 'owner'}))
    assert error.value.status_code == 400
    storage[1].upload_from_stream.assert_not_called()


@pytest.mark.parametrize('data,code', [(b'', 400), (b'012345', 413)])
def test_empty_and_oversize_uploads_rejected(storage, monkeypatch, data, code):
    monkeypatch.setattr(routes, 'MAX_VIDEO_BYTES', 5)
    with pytest.raises(HTTPException) as error:
        run(routes.create_session(upload(data), None, None, str(ObjectId()), {'id': 'owner'}))
    assert error.value.status_code == code
    storage[1].upload_from_stream.assert_not_called()


def test_failed_session_insert_cleans_video(storage):
    db, bucket = storage
    db.sessions.insert_one.side_effect = RuntimeError('database down')
    with pytest.raises(RuntimeError):
        run(routes.create_session(upload(), None, None, str(ObjectId()), {'id': 'owner'}))
    bucket.delete.assert_awaited_once_with(bucket.upload_from_stream.return_value)


def test_failed_rereview_preserves_old_review(storage, monkeypatch):
    db, bucket = storage
    db.sessions.find_one.return_value = {'_id': ObjectId(), 'video_id': ObjectId(), 'review': 'Old review'}
    bucket.open_download_stream = AsyncMock(return_value=SimpleNamespace(read=AsyncMock(return_value=b'video'), metadata={}))
    monkeypatch.setattr(routes, 'review_video', AsyncMock(side_effect=RuntimeError('secret upstream message')))
    with pytest.raises(HTTPException) as error:
        run(routes.re_review_session(str(ObjectId()), {'id': 'owner'}))
    assert error.value.status_code == 502
    assert 'secret' not in error.value.detail
    db.sessions.update_one.assert_not_called()


def test_delete_storage_error_preserves_record_for_retry(storage):
    db, bucket = storage
    db.sessions.find_one.return_value = {'video_id': ObjectId()}
    db.sessions.delete_one = AsyncMock()
    bucket.delete.side_effect = RuntimeError('storage down')
    with pytest.raises(RuntimeError):
        run(routes.delete_session(str(ObjectId()), {'id': 'owner'}))
    db.sessions.delete_one.assert_not_called()


def test_json_parser_rejects_non_strings():
    assert _extract_json('[{"text":null,"gesture":123}]') == []
    assert _extract_json(None) == []
    assert _extract_json('```json\n[{"text":" Hello ","gesture":"Wave"}]\n```') == [{'text': 'Hello', 'gesture': 'Wave'}]


def test_api_auth_boundary_and_health():
    client = TestClient(main.app)
    assert client.get('/api/health').status_code == 200
    for path in ['/api/sessions', '/api/ideation', '/api/albums', '/api/auth/me']:
        assert client.get(path).status_code == 401


def test_album_deleted_during_review_does_not_orphan_upload(storage):
    db, bucket = storage
    db.albums.find_one.side_effect = [{'name': 'Album'}, None]
    db.sessions.insert_one.return_value = SimpleNamespace(inserted_id=ObjectId())
    db.sessions.delete_one = AsyncMock()
    with pytest.raises(HTTPException) as error:
        run(routes.create_session(upload(), None, None, str(ObjectId()), {'id': 'owner'}))
    assert error.value.status_code == 409
    bucket.delete.assert_awaited_once()
    db.sessions.delete_one.assert_awaited_once()


def test_thumbnail_extraction_on_real_video(tmp_path):
    import subprocess
    import imageio_ffmpeg
    from thumbnail_service import extract_thumbnail
    clip = tmp_path / 'clip.mp4'
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-f', 'lavfi', '-i',
                    'color=c=blue:s=320x180:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(clip)],
                   check=True, capture_output=True, timeout=30)
    thumbnail = run(extract_thumbnail(clip.read_bytes(), 'video/mp4'))
    assert thumbnail.startswith('data:image/jpeg;base64,')
