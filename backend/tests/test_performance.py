import asyncio
import copy
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

import main
from auth.service import get_current_user
from performance import routes, service


def report_for(sessions):
    return {
        'summary': 'Saved feedback suggests clearer delivery; other skills need more evidence.',
        'dimensions': [{
            'dimension': dimension,
            'trend': 'improved' if dimension == 'clarity' else 'insufficient_evidence',
            'baseline': 'Earlier feedback flagged clarity.' if dimension == 'clarity' else 'Not assessed.',
            'latest': 'Recent feedback describes clear delivery.' if dimension == 'clarity' else 'Not assessed.',
            'explanation': 'Based on the cited feedback.',
            'next_step': 'Practice the opening again and check clarity.',
            'evidence': [{'session_id': session['id'], 'quote': session['review']}
                         for session in (sessions[0], sessions[-1])] if dimension == 'clarity' else [],
        } for dimension in service.DIMENSIONS],
    }


@pytest.fixture
def sources():
    return [
        {'id': 'first', 'review': 'Opening is hard to follow.'},
        {'id': 'latest', 'review': 'Opening is clear and concise.'},
    ]


def test_comparison_graph_validates_and_returns_structured_report(monkeypatch, sources):
    request = MagicMock(return_value=json.dumps(report_for(sources)))
    monkeypatch.setattr(service, '_request_comparison', request)
    report = asyncio.run(service.review_performance(sources))
    assert report['dimensions'][0]['trend'] == 'improved'
    assert report['dimensions'][1]['trend'] == 'insufficient_evidence'
    request.assert_called_once()


@pytest.mark.parametrize('problem', ['unknown_session', 'invented_quote', 'missing_baseline', 'duplicate_dimension'])
def test_reviewer_rejects_unsupported_reports_and_retries(monkeypatch, sources, problem):
    valid = report_for(sources)
    invalid = copy.deepcopy(valid)
    evidence = invalid['dimensions'][0]['evidence']
    if problem == 'unknown_session':
        evidence[0]['session_id'] = 'someone-else'
    elif problem == 'invented_quote':
        evidence[0]['quote'] = 'Pacing improved by 72 percent.'
    elif problem == 'missing_baseline':
        evidence.pop(0)
    else:
        invalid['dimensions'][1]['dimension'] = 'clarity'
    request = MagicMock(side_effect=[json.dumps(invalid), json.dumps(valid)])
    monkeypatch.setattr(service, '_request_comparison', request)
    result = asyncio.run(service.review_performance(sources))
    assert result == valid
    assert request.call_count == 2
    assert request.call_args.args[1]


def test_reviewer_stops_after_two_invalid_outputs(monkeypatch, sources):
    request = MagicMock(return_value='invalid JSON')
    monkeypatch.setattr(service, '_request_comparison', request)
    with pytest.raises(RuntimeError, match='supported performance'):
        asyncio.run(service.review_performance(sources))
    assert request.call_count == 2


def test_reviewer_requires_two_sources(sources):
    with pytest.raises(ValueError, match='two reviewed'):
        asyncio.run(service.review_performance(sources[:1]))


@pytest.mark.parametrize('review', ['', None, 'Review unavailable. Please try Re-review later.', '_Review failed: busy_'])
def test_failed_feedback_is_excluded(review):
    assert not routes.usable_review(review)


@pytest.mark.skipif(not os.getenv('TEST_MONGO_URL'), reason='Set TEST_MONGO_URL for MongoDB integration')
def test_performance_api_ownership_cache_freshness_and_concurrency(monkeypatch):
    url = os.environ['TEST_MONGO_URL']
    name = 'gestural_test_' + uuid.uuid4().hex
    monkeypatch.setenv('MONGO_URL', url)
    monkeypatch.setenv('MONGO_DB', name)
    monkeypatch.setenv('JWT_SECRET', 'integration-secret-with-at-least-32-bytes')
    mongo = MongoClient(url)
    db = mongo[name]
    album_id = db.albums.insert_one({'user_id': 'owner', 'name': 'Pitch'}).inserted_id
    session_ids = []
    for index in range(8):
        session_ids.append(db.sessions.insert_one({
            'album_id': str(album_id), 'user_id': 'owner', 'name': f'Take {index}',
            'created_at': datetime.now(timezone.utc) + timedelta(minutes=index),
            'review': f'Clear delivery in take {index}.' if index != 6 else 'Review unavailable. Try again.',
        }).inserted_id)
    # A corrupt cross-owner association must not appear in the report.
    db.sessions.insert_one({'album_id': str(album_id), 'user_id': 'other', 'review': 'PRIVATE'})
    reviewer = AsyncMock(side_effect=report_for)
    monkeypatch.setattr(routes, 'review_performance', reviewer)
    endpoint = f'/api/albums/{album_id}/performance'
    try:
        with TestClient(main.app) as client:
            assert client.get(endpoint).status_code == 401
            main.app.dependency_overrides[get_current_user] = lambda: {'id': 'other'}
            assert client.get(endpoint).status_code == 404
            assert client.post(endpoint).status_code == 404
            reviewer.assert_not_called()
            main.app.dependency_overrides[get_current_user] = lambda: {'id': 'owner'}
            assert client.get('/api/albums/invalid/performance').status_code == 400
            result = client.get(endpoint).json()
            assert result['report'] is None
            assert result['recording_count'] == 6
            assert result['reviewed_count'] == 5
            generated = client.post(endpoint)
            assert generated.status_code == 200, generated.text
            report = generated.json()['report']
            assert [r['name'] for r in report['recordings']] == ['Take 2', 'Take 3', 'Take 4', 'Take 5', 'Take 7']
            assert report['excluded_count'] == 1
            assert 'source_fingerprint' not in report
            assert 'review' not in report['recordings'][0]
            assert client.post(endpoint).json()['report'] == report
            assert reviewer.await_count == 1
            assert client.get(endpoint).json()['report'] == report
            db.sessions.update_one({'_id': session_ids[-1]}, {'$set': {'review': 'Updated coaching feedback.'}})
            result = client.get(endpoint).json()
            assert result['stale'] and result['report'] is None
            assert client.post(endpoint).status_code == 200
            assert reviewer.await_count == 2
            db.sessions.delete_one({'_id': session_ids[3]})
            assert client.get(endpoint).json()['stale']
            previous = db.albums.find_one({'_id': album_id})['performance_report']
            reviewer.side_effect = RuntimeError('private provider details')
            failure = client.post(endpoint)
            assert failure.status_code == 502
            assert 'private provider' not in failure.text
            assert db.albums.find_one({'_id': album_id})['performance_report'] == previous
            def change_during_review(sessions):
                db.sessions.update_one({'_id': session_ids[-1]}, {'$set': {'review': 'Changed during generation'}})
                return report_for(sessions)
            reviewer.side_effect = change_during_review
            assert client.post(endpoint).status_code == 409
            db.sessions.delete_many({'album_id': str(album_id), '_id': {'$ne': session_ids[-1]}})
            assert client.post(endpoint).status_code == 400
    finally:
        main.app.dependency_overrides.clear()
        mongo.drop_database(name)
        mongo.close()
