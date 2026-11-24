import asyncio
from dataclasses import replace
import json
import time

from fastapi.testclient import TestClient
import pytest

from app.config import Settings
from app.database import Database
from app.main import create_app
from app.ollama import OllamaError
from app.prompts import build_prompt
from app.schemas import Conditions


class LocalModelDouble:
    """API tests use a controlled transport; real Ollama is checked separately."""
    def __init__(self):
        self.calls = []
        self.active = 0
        self.max_active = 0
        self.fail_at = None
        self.unavailable = False
        self.delay = 0.025

    async def check(self):
        if self.unavailable:
            raise OllamaError('Ollamaを起動してください。')
        return ['qwen3:8b']

    async def generate(self, messages, temperature, seed):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        self.calls.append((messages, temperature, seed))
        try:
            await asyncio.sleep(self.delay)
            if len(self.calls) == self.fail_at:
                raise OllamaError('テスト用の生成エラー')
            return f'日本語の回答 {len(self.calls)}'
        finally:
            self.active -= 1


@pytest.fixture
def setup(tmp_path):
    settings = Settings(database_path=tmp_path / 'lab.sqlite3')
    model = LocalModelDouble()
    return settings, model


@pytest.fixture
def client(setup):
    settings, model = setup
    with TestClient(create_app(settings, model)) as client:
        yield client


def wait_run(client, question_id):
    for _ in range(250):
        run = client.get(f'/api/questions/{question_id}/responses').json()
        if run['question']['status'] != 'generating':
            return run
        time.sleep(.01)
    pytest.fail('比較処理が完了しませんでした。')


def add_memory(client, pid, event='発表で失敗した', thought='次は準備をしよう'):
    response = client.post(f'/api/personalities/{pid}/memories', json={'past_memory': event, 'think': thought})
    assert response.status_code == 201
    return response.json()


def test_four_profiles_edit_independently_and_persist(setup):
    settings, model = setup
    with TestClient(create_app(settings, model)) as client:
        profiles = client.get('/api/personalities').json()
        assert [p['personality_name'] for p in profiles] == ['ハル', 'ナツ', 'アキ', 'フユ']
        assert all(p['memories'] == [] for p in profiles)
        for i, profile in enumerate(profiles):
            changed = client.put(f"/api/personalities/{profile['personality_id']}", json={
                'personality_name': f'人格{i}', 'personality1': f'性格{i}', 'personality2': None})
            assert changed.status_code == 200
        memory = add_memory(client, profiles[0]['personality_id'])
        client.post(f"/api/memories/{memory['memory_id']}/formed-personalities",
                    json={'formed_personality': '経験から学ぶ'})
        expected = client.get('/api/personalities').json()
    with TestClient(create_app(settings, model)) as restarted:
        actual = restarted.get('/api/personalities').json()
        assert actual == expected
        assert len(actual) == 4


def test_memory_and_values_crud_cascade_and_isolation(client):
    one = add_memory(client, 1)
    two = add_memory(client, 1, '友人に助けてもらった', '誰かを助けたい')
    other = add_memory(client, 2, '競走で優勝した', '努力は報われる')
    value_ids = []
    for text in ['挑戦を大切にする', '準備を怠らない']:
        value = client.post(f"/api/memories/{one['memory_id']}/formed-personalities", json={'formed_personality': text})
        assert value.status_code == 201
        value_ids.append(value.json()['formed_id'])
    assert client.put(f"/api/formed-personalities/{value_ids[0]}", json={'formed_personality': '挑戦し続ける'}).status_code == 200
    assert client.put(f"/api/memories/{two['memory_id']}", json={'past_memory': '友人と協力した', 'think': '協力は大事'}).status_code == 200
    mine = client.get('/api/personalities/1/memories').json()
    assert len(mine) == 2 and len(mine[0]['formed_personalities']) == 2
    assert mine[0]['formed_personalities'][0]['formed_personality'] == '挑戦し続ける'
    assert mine[1]['think'] == '協力は大事'
    assert client.get('/api/personalities/2/memories').json()[0]['memory_id'] == other['memory_id']
    assert client.delete(f"/api/formed-personalities/{value_ids[1]}").status_code == 204
    assert client.delete(f"/api/memories/{one['memory_id']}").status_code == 204
    assert client.put(f"/api/formed-personalities/{value_ids[0]}", json={'formed_personality': '削除済み'}).status_code == 404
    assert len(client.get('/api/personalities/1/memories').json()) == 1


def test_compare_snapshots_independence_sequential_settings_and_no_mutation(client, setup):
    settings, model = setup
    for pid in range(1, 5):
        memory = add_memory(client, pid, f'固有の経験{pid}', f'固有の解釈{pid}')
        client.post(f"/api/memories/{memory['memory_id']}/formed-personalities", json={'formed_personality': f'固有の価値観{pid}'})
    before = client.get('/api/personalities').json()
    posted = client.post('/api/compare', json={'question': 'どう思う？', 'temperature': .4, 'seed': 123})
    assert posted.status_code == 202
    qid = posted.json()['question_id']
    run = wait_run(client, qid)
    assert run['question']['status'] == 'complete'
    assert len(run['responses']) == 4
    assert model.max_active == 1
    assert client.get('/api/personalities').json() == before
    for index, response in enumerate(run['responses'], 1):
        assert response['model_name'] == 'qwen3:8b'
        assert response['temperature'] == .4 and response['seed'] == 123
        assert response['messages'][-1] == {'role': 'user', 'content': 'どう思う？'}
        system = response['messages'][0]['content']
        assert f'固有の経験{index}' in system
        assert f'固有の解釈{index}' in system
        assert f'固有の価値観{index}' in system
        for other in range(1, 5):
            if index != other:
                assert f'固有の経験{other}' not in system
                assert f'固有の解釈{other}' not in system
                assert f'固有の価値観{other}' not in system
    client.put('/api/personalities/1', json={'personality_name': '変更後', 'personality1': '別の性格'})
    assert client.get(f'/api/questions/{qid}/responses').json() == run
    assert client.get('/api/questions').json()[0]['question_id'] == qid
    retry = client.post('/api/compare', json={'question': 'どう思う？', 'parent_question_id': qid})
    retry_run = wait_run(client, retry.json()['question_id'])
    assert retry_run['question']['parent_question_id'] == qid
    assert len(client.get('/api/questions').json()) == 2
    assert client.get(f'/api/questions/{qid}/responses').json() == run
    # The archived prompt and the entire run survive a new DB connection.
    assert Database(settings.database_path).responses(qid) == run['responses']


@pytest.mark.parametrize('flags', range(16))
def test_all_condition_combinations(client, setup, flags):
    settings, _ = setup
    memory = add_memory(client, 1, 'EVENT_SECRET', 'THOUGHT_SECRET')
    client.post(f"/api/memories/{memory['memory_id']}/formed-personalities", json={'formed_personality': 'VALUE_SECRET'})
    profile = client.get('/api/personalities/1').json()
    conditions = Conditions(**{key: bool(flags & (1 << i)) for i, key in enumerate(['basic', 'memories', 'thoughts', 'formed'])})
    messages, metadata = build_prompt(profile, 'QUESTION_SECRET', conditions, settings)
    system = messages[0]['content']
    assert ('EVENT_SECRET' in system) == conditions.memories
    assert ('THOUGHT_SECRET' in system) == conditions.thoughts
    assert ('VALUE_SECRET' in system) == conditions.formed
    assert ('明るい' in system) == conditions.basic
    assert ('ハル' in system) == (flags != 0)
    assert 'QUESTION_SECRET' not in system
    assert messages[1]['content'] == 'QUESTION_SECRET'
    if flags == 0:
        another = client.get('/api/personalities/2').json()
        assert build_prompt(another, 'QUESTION_SECRET', conditions, settings)[0] == messages
        assert metadata['used_information'] == {'memories': []}


def test_context_omits_whole_linked_memories_and_reports_ids(client, setup):
    settings, _ = setup
    long_memory = add_memory(client, 1, '長' * 9000, 'THOUGHT_NOT_SENT')
    small_memory = add_memory(client, 1, '小さな経験', '小さな気づき')
    profile = client.get('/api/personalities/1').json()
    messages, meta = build_prompt(profile, 'どう思う？', Conditions(), settings)
    assert meta['omitted_memory_ids'] == [long_memory['memory_id']]
    assert meta['included_memory_ids'] == [small_memory['memory_id']]
    assert 'THOUGHT_NOT_SENT' not in messages[0]['content']
    assert '小さな経験' in messages[0]['content'] and '小さな気づき' in messages[0]['content']
    assert '出来事番号' in messages[0]['content']


def test_duplicate_send_partial_failure_and_unavailable(client, setup):
    _, model = setup
    model.delay = .12
    model.fail_at = 2
    accepted = client.post('/api/compare', json={'question': '比較テスト'})
    assert accepted.status_code == 202
    assert client.post('/api/compare', json={'question': '二重送信'}).status_code == 409
    run = wait_run(client, accepted.json()['question_id'])
    assert run['question']['status'] == 'partial'
    assert sum(r['status'] == 'complete' for r in run['responses']) == 3
    assert run['responses'][1]['error'] == 'テスト用の生成エラー'
    model.unavailable = True
    assert client.get('/api/health').json()['ready'] is False
    assert client.post('/api/compare', json={'question': '接続なし'}).status_code == 503
    assert len(client.get('/api/questions').json()) == 1


def test_validation_duplicates_and_local_only(client):
    assert client.put('/api/personalities/1', json={'personality_name': 'ナツ', 'personality1': '性格'}).status_code == 409
    for data in [{'question': ' '}, {'question': 'a', 'seed': -1}, {'question': 'a', 'temperature': 9}, {'question': 'a', 'unknown': True}]:
        response = client.post('/api/compare', json=data)
        assert response.status_code == 422
        assert '入力内容' in response.json()['detail']
    assert client.post('/api/personalities/999/memories', json={'past_memory': 'a', 'think': 'b'}).status_code == 404
    assert client.get('/api/questions/999/responses').status_code == 404
    assert client.get('/api/personalities', headers={'origin': 'https://example.com'}).status_code == 403
    assert client.get('/api/personalities', headers={'host': 'example.com'}).status_code == 400
    assert client.get('/api/health').json()['ready'] is True


def test_reject_nonlocal_ollama(setup):
    settings, _ = setup
    for address in ['https://example.com', 'http://192.168.1.10:11434', 'http://user:pass@localhost:11434', 'http://localhost:11434/api']:
        with pytest.raises(ValueError):
            replace(settings, ollama_url=address)
    with pytest.raises(ValueError):
        replace(settings, model='qwen3:cloud')


def test_interrupted_run_retains_history_and_can_retry(setup):
    settings, model = setup
    db = Database(settings.database_path)
    db.initialize()
    qid = db.execute('INSERT INTO questions(question,created_at,settings_json) VALUES(?,?,?)', ('中断した質問', '2026-01-01', json.dumps({})))
    with TestClient(create_app(settings, model)) as client:
        run = client.get(f'/api/questions/{qid}/responses').json()
        assert run['question']['status'] == 'failed'
        assert '中断' in run['question']['error']
        assert client.post('/api/compare', json={'question': '再開後'}).status_code == 202
