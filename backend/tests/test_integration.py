"""Optional real MongoDB coverage. Uses and removes its own randomly named database."""
import os
import uuid
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from bson import ObjectId

import main
from practice import routes
from ideation import routes as ideation_routes


@pytest.mark.skipif(not os.getenv('TEST_MONGO_URL'), reason='Set TEST_MONGO_URL for real MongoDB tests')
def test_account_and_recording_lifecycle(monkeypatch):
    url = os.environ['TEST_MONGO_URL']
    name = 'gestural_test_' + uuid.uuid4().hex
    monkeypatch.setenv('MONGO_URL', url)
    monkeypatch.setenv('MONGO_DB', name)
    monkeypatch.setenv('JWT_SECRET', 'integration-test-secret-at-least-32-bytes')
    monkeypatch.setattr(routes, 'review_video', AsyncMock(return_value='## Strengths\n- Clear delivery'))
    monkeypatch.setattr(routes, 'extract_thumbnail', AsyncMock(return_value=None))
    monkeypatch.setattr(ideation_routes, 'generate_ideation', AsyncMock(return_value=[{'text': 'Hi', 'gesture': 'Wave'}]))
    mongo = MongoClient(url)
    legacy_id = mongo[name].sessions.insert_one({'user_id': 'legacy'}).inserted_id
    try:
        with TestClient(main.app) as client:
            assert mongo[name].sessions.find_one({'_id': legacy_id}) is not None
            def register(email):
                response = client.post('/api/auth/register', json={'email': email, 'name': 'Test', 'password': 'secure123'})
                assert response.status_code == 201, response.text
                return {'Authorization': 'Bearer ' + response.json()['token']}
            owner = register('owner@example.com')
            other = register('other@example.com')
            assert client.post('/api/auth/register', json={'email': 'OWNER@example.com', 'name': 'Test', 'password': 'secure123'}).status_code == 409
            assert client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'secure123'}).status_code == 200
            assert client.post('/api/auth/login', json={'email': 'owner@example.com', 'password': 'wrong'}).status_code == 401
            assert client.get('/api/auth/me', headers=owner).json()['email'] == 'owner@example.com'
            album = client.post('/api/albums', json={'name': 'Pitch'}, headers=owner).json()
            idea = client.post('/api/ideation', json={'prompt': 'A pitch'}, headers=owner).json()
            assert client.get('/api/ideation/' + idea['id'], headers=other).status_code == 404
            response = client.post('/api/sessions', files={'video': ('take.mp4', b'test video', 'video/mp4')},
                                   data={'album_id': album['id'], 'ideation_id': idea['id']}, headers=owner)
            assert response.status_code == 201, response.text
            session = response.json()
            assert session['ideation']['id'] == idea['id']
            sid = session['id']
            assert client.get('/api/sessions/' + sid + '/video', headers=owner).content == b'test video'
            for method, path, kwargs in [
                ('get', '/api/sessions/' + sid, {}),
                ('get', '/api/sessions/' + sid + '/video', {}),
                ('patch', '/api/sessions/' + sid, {'json': {'name': 'stolen'}}),
                ('delete', '/api/albums/' + album['id'], {}),
                ('post', '/api/sessions/' + sid + '/re-review', {}),
            ]:
                assert getattr(client, method)(path, headers=other, **kwargs).status_code == 404
            assert client.get('/api/sessions', headers=other).json() == []
            assert client.patch('/api/sessions/' + sid, json={'name': ' Renamed '}, headers=owner).json()['name'] == 'Renamed'
            assert client.post('/api/sessions/' + sid + '/re-review', headers=owner).status_code == 200
            assert client.get('/api/albums', headers=owner).json()[0]['session_count'] == 1
            assert client.delete('/api/albums/' + album['id'], headers=owner).status_code == 204
            assert client.get('/api/sessions/' + sid, headers=owner).status_code == 404
            assert mongo[name]['videos.files'].count_documents({}) == 0
            assert mongo[name]['videos.chunks'].count_documents({}) == 0
    finally:
        mongo.drop_database(name)
        mongo.close()
