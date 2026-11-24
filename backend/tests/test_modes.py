from dataclasses import replace

from fastapi.testclient import TestClient
import pytest

from app.main import create_app
from tests.test_app import wait_run

DEMO = {'X-Lab-Mode': 'demo'}


def test_default_is_empty_normal_db_and_demo_is_preloaded(client, setup):
    settings, model = setup
    normal = client.get('/api/personalities')
    assert normal.headers['X-Lab-Mode'] == 'normal'
    assert all(p['memories'] == [] for p in normal.json())
    demo = client.get('/api/personalities', headers=DEMO)
    assert demo.headers['X-Lab-Mode'] == 'demo'
    assert demo.headers['Cache-Control'] == 'no-store'
    assert len(demo.json()) == 4
    assert all(len(p['memories']) == 2 for p in demo.json())
    assert all(len(m['formed_personalities']) == 2 for p in demo.json() for m in p['memories'])
    assert settings.database_path.exists() and settings.demo_path.exists()
    assert settings.database_path != settings.demo_path
    assert model.calls == []


def test_profile_memory_and_values_are_isolated_even_with_identical_ids(client):
    original_demo = client.get('/api/personalities', headers=DEMO).json()
    saved = client.post('/api/personalities/1/memories', json={'past_memory': '自分の経験', 'think': '自分の解釈'}).json()
    normal_value = client.post(f"/api/memories/{saved['memory_id']}/formed-personalities",
                              json={'formed_personality': '自分の価値観'}).json()
    assert saved['memory_id'] == original_demo[0]['memories'][0]['memory_id']
    assert normal_value['formed_id'] == original_demo[0]['memories'][0]['formed_personalities'][0]['formed_id']
    assert client.get('/api/personalities', headers=DEMO).json() == original_demo

    normal_before = client.get('/api/personalities').json()
    assert client.put('/api/personalities/1', headers=DEMO,
                      json={'personality_name': 'デモ専用', 'personality1': 'サンプルの性格'}).status_code == 200
    assert client.put('/api/memories/1', headers=DEMO,
                      json={'past_memory': 'デモの変更', 'think': 'デモの解釈'}).status_code == 200
    assert client.put('/api/formed-personalities/1', headers=DEMO,
                      json={'formed_personality': 'デモの価値観'}).status_code == 200
    assert client.post('/api/memories/1/formed-personalities', headers=DEMO,
                       json={'formed_personality': 'デモの追記'}).status_code == 201
    assert client.get('/api/personalities').json() == normal_before
    demo_before = client.get('/api/personalities', headers=DEMO).json()

    assert client.delete('/api/formed-personalities/1').status_code == 204
    assert client.delete('/api/memories/1').status_code == 204
    assert client.get('/api/personalities', headers=DEMO).json() == demo_before
    assert client.get('/api/personalities/1/memories').json() == []
    assert client.get('/api/personalities/1/memories', headers=DEMO).json()[0]['past_memory'] == 'デモの変更'


def test_mode_histories_and_background_generation_stay_in_their_db(setup):
    settings, model = setup
    model.delay = .08
    with TestClient(create_app(settings, model)) as client:
        client.put('/api/personalities/1', headers=DEMO,
                   json={'personality_name': 'デモ専用', 'personality1': '慎重'})
        normal_profiles = client.get('/api/personalities').json()
        demo_profiles = client.get('/api/personalities', headers=DEMO).json()
        normal_id = client.post('/api/compare', json={'question': '通常の質問'}).json()['question_id']
        status = client.get('/api/health', headers=DEMO).json()
        assert status['mode'] == 'demo' and status['generation_busy'] is True
        assert status['active_question_id'] is None
        assert client.post('/api/compare', headers=DEMO, json={'question': '同時実行'}).status_code == 409
        normal = wait_run(client, normal_id)
        assert client.get('/api/questions', headers=DEMO).json() == []
        assert client.get(f'/api/questions/{normal_id}/responses', headers=DEMO).status_code == 404
        assert client.post('/api/compare', headers=DEMO,
                           json={'question': '別DBの履歴は参照しない', 'parent_question_id': normal_id}).status_code == 404

        demo_id = client.post('/api/compare', headers=DEMO, json={'question': 'デモの質問'}).json()['question_id']
        assert demo_id == normal_id  # IDs may coincide; they must never select the other DB.
        assert client.get('/api/health').json()['active_question_id'] is None
        assert client.get(f'/api/questions/{normal_id}/responses').json() == normal
        import time
        for _ in range(200):
            demo = client.get(f'/api/questions/{demo_id}/responses', headers=DEMO).json()
            if demo['question']['status'] != 'generating':
                break
            time.sleep(.01)
        assert demo['question']['status'] == 'complete'
        assert all(len(r['metadata']['included_memory_ids']) == 2 for r in demo['responses'])
        assert all(r['metadata']['included_memory_ids'] == [] for r in normal['responses'])
        assert 'デモ専用' in demo['responses'][0]['prompt']
        assert 'デモ専用' not in normal['responses'][0]['prompt']
        assert client.get('/api/questions').json()[0]['question'] == '通常の質問'
        assert client.get('/api/questions', headers=DEMO).json()[0]['question'] == 'デモの質問'
        assert client.get('/api/personalities').json() == normal_profiles
        assert client.get('/api/personalities', headers=DEMO).json() == demo_profiles
    with TestClient(create_app(settings, model)) as restarted:
        assert restarted.get('/api/personalities', headers=DEMO).json() == demo_profiles
        assert restarted.get('/api/personalities').json() == normal_profiles
        assert restarted.get(f'/api/questions/{normal_id}/responses').json() == normal
        assert restarted.get(f'/api/questions/{demo_id}/responses', headers=DEMO).json() == demo


def test_invalid_mode_and_same_database_are_rejected(client, setup):
    settings, _ = setup
    for mode in ('unknown', '../normal', ''):
        assert client.get('/api/personalities', headers={'X-Lab-Mode': mode}).status_code == 422
    with pytest.raises(ValueError, match='別のデータベース'):
        replace(settings, demo_database_path=settings.database_path)
    for origin in ('https://example.com', 'http://127.0.0.1:13000/path', 'http://user@localhost:3000'):
        with pytest.raises(ValueError, match='FRONTEND_ORIGIN'):
            replace(settings, frontend_origin=origin)
