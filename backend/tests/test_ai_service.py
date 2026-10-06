import asyncio
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

import ai_service as ai


def run(coro):
    return asyncio.run(coro)


def test_ideation_graph_retries_once(monkeypatch):
    generate = MagicMock(side_effect=['not JSON', '[{"text":"Hi","gesture":"Wave"}]'])
    monkeypatch.setattr(ai, '_generate_text', generate)
    assert run(ai.generate_ideation('Greeting')) == [{'text': 'Hi', 'gesture': 'Wave'}]
    assert generate.call_count == 2
    assert 'IMPORTANT' in generate.call_args.args[0]


def test_ideation_graph_stops_after_two_invalid_responses(monkeypatch):
    generate = MagicMock(return_value='invalid')
    monkeypatch.setattr(ai, '_generate_text', generate)
    assert run(ai.generate_ideation('Greeting')) == []
    assert generate.call_count == 2


def test_valid_ideation_does_not_retry(monkeypatch):
    generate = MagicMock(return_value='[{"text":"Hi","gesture":"Wave"}]')
    monkeypatch.setattr(ai, '_generate_text', generate)
    assert run(ai.generate_ideation('Greeting'))
    generate.assert_called_once()


def test_graph_requests_do_not_share_state(monkeypatch):
    import json
    def generate(prompt):
        topic = prompt.split('User topic: ')[1]
        return json.dumps([{'text': topic, 'gesture': 'Wave'}])
    monkeypatch.setattr(ai, '_generate_text', generate)
    async def both():
        return await asyncio.gather(ai.generate_ideation('First'), ai.generate_ideation('Second'))
    first, second = run(both())
    assert first[0]['text'] == 'First'
    assert second[0]['text'] == 'Second'


def file(state='ACTIVE'):
    return SimpleNamespace(name='files/test', uri='https://example.com/video',
                           mime_type='video/webm', state=SimpleNamespace(name=state))


@pytest.fixture
def client(monkeypatch):
    client = MagicMock()
    client.__enter__.return_value = client
    client.files.upload.return_value = file()
    client.files.get.return_value = file()
    client.models.generate_content.return_value = SimpleNamespace(text=json.dumps({
        'strengths': ['Clear delivery'], 'drills': ['Practice eye contact'],
        'notes': [{'start': 5, 'end': 8, 'text': 'Keep eye contact'}],
    }))
    monkeypatch.setattr(ai, '_get_client', lambda: client)
    monkeypatch.setattr(ai.time, 'sleep', lambda _: None)
    return client


def test_video_graph_uploads_original_bytes_and_cleans_remote_file(client):
    result = run(ai.review_video(b'video', 'video/webm;codecs=vp9,opus', 'Practice plan'))
    assert 'Clear delivery' in result
    upload = client.files.upload.call_args.kwargs
    assert upload['file'].getvalue() == b'video'
    assert upload['config'].mime_type == 'video/webm'
    contents = client.models.generate_content.call_args.kwargs['contents']
    assert contents[0].file_data.file_uri == 'https://example.com/video'
    assert 'Practice plan' in contents[1]
    client.files.delete.assert_called_once_with(name='files/test')
    client.__exit__.assert_called_once()


def test_waits_for_video_processing(client):
    client.files.upload.return_value = file('PROCESSING')
    assert run(ai.review_video(b'video', 'video/webm', None))
    client.files.get.assert_called_once_with(name='files/test')


@pytest.mark.parametrize('failure', ['processing', 'generation', 'empty'])
def test_video_failure_still_deletes_upload(client, failure):
    if failure == 'processing':
        client.files.upload.return_value = file('FAILED')
    elif failure == 'generation':
        client.models.generate_content.side_effect = RuntimeError('upstream failed')
    else:
        client.models.generate_content.return_value.text = ''
    with pytest.raises(RuntimeError):
        run(ai.review_video(b'video', 'video/webm', None))
    client.files.delete.assert_called_once_with(name='files/test')


def test_processing_timeout_cleans_upload(client, monkeypatch):
    client.files.upload.return_value = file('PROCESSING')
    monkeypatch.setattr(ai, 'FILE_PROCESSING_TIMEOUT_SECONDS', 0)
    with pytest.raises(RuntimeError, match='timed out'):
        run(ai.review_video(b'video', 'video/webm', None))
    client.files.delete.assert_called_once()


def test_cleanup_failure_does_not_discard_review(client):
    client.files.delete.side_effect = RuntimeError('cleanup failed')
    assert 'Clear delivery' in run(ai.review_video(b'video', 'video/webm', None))


def test_missing_key_fails_clearly(monkeypatch):
    monkeypatch.delenv('GOOGLE_API_KEY', raising=False)
    with pytest.raises(RuntimeError, match='GOOGLE_API_KEY'):
        ai._get_client()


def test_sdk_configuration_and_json_output(client, monkeypatch):
    monkeypatch.setenv('GEMINI_MODEL', 'test-model')
    client.models.generate_content.return_value.text = '[]'
    assert ai._generate_text('prompt') == '[]'
    args = client.models.generate_content.call_args.kwargs
    assert args['model'] == 'test-model'
    assert args['config'].response_mime_type == 'application/json'


def test_missing_notes_are_retried_without_reuploading(client):
    valid = client.models.generate_content.return_value
    client.models.generate_content.side_effect = [
        SimpleNamespace(text='{"strengths":["Good"],"drills":["Practice"],"notes":[]}'), valid,
    ]
    result = run(ai.review_video(b'video', 'video/webm', None))
    assert '## Timestamped Notes\n0:05-0:08: Keep eye contact' in result
    assert client.models.generate_content.call_count == 2
    client.files.upload.assert_called_once()
    client.files.delete.assert_called_once()


def test_incomplete_review_is_not_saved_as_success(client):
    client.models.generate_content.return_value.text = '{"strengths":["Good"],"drills":["Practice"],"notes":[]}'
    with pytest.raises(RuntimeError, match='incomplete review'):
        run(ai.review_video(b'video', 'video/webm', None))
    assert client.models.generate_content.call_count == 2
    client.files.delete.assert_called_once()


def test_transient_generation_failure_is_retried(client):
    from google.genai.errors import APIError
    valid = client.models.generate_content.return_value
    client.models.generate_content.side_effect = [APIError(503, {'error': {'message': 'Busy'}}), valid]
    assert 'Timestamped Notes' in run(ai.review_video(b'video', 'video/webm', None))
    assert client.models.generate_content.call_count == 2


def test_invalid_timestamp_range_is_rejected():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ai.TimestampedNote(start=8, end=5, text='Look up')
