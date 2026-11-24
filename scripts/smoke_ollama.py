"""Real local-model integration smoke test, using an isolated temporary SQLite DB.

Run from repository root: .venv/Scripts/python scripts/smoke_ollama.py
OLLAMA_MODEL can select an already downloaded model. No model is downloaded here.
"""
from dataclasses import replace
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi.testclient import TestClient
from app.config import Settings
from app.main import create_app


def main():
    with TemporaryDirectory(prefix='personality-lab-smoke-') as directory:
        settings = replace(Settings.from_env(), database_path=Path(directory) / 'smoke.sqlite3')
        with TestClient(create_app(settings)) as client:
            health = client.get('/api/health').json()
            if not health['ready']:
                raise RuntimeError(health['error'])
            before = client.get('/api/personalities').json()
            accepted = client.post('/api/compare', json={'question': '新しい趣味を始めたい。どう思う？', 'seed': 42, 'temperature': .7})
            assert accepted.status_code == 202, accepted.text
            qid = accepted.json()['question_id']
            deadline = time.monotonic() + settings.timeout * 4 + 60
            while time.monotonic() < deadline:
                result = client.get(f'/api/questions/{qid}/responses').json()
                if result['question']['status'] != 'generating':
                    break
                time.sleep(1)
            assert result['question']['status'] == 'complete', result
            assert len(result['responses']) == 4
            assert all(r['response'] and r['messages'][1]['role'] == 'user' for r in result['responses'])
            assert client.get('/api/personalities').json() == before
            print(f"PASS: {settings.model}, four real local responses, lengths={[len(r['response']) for r in result['responses']]}")
        with TestClient(create_app(settings)) as restarted:
            assert restarted.get(f'/api/questions/{qid}/responses').json() == result
            print('PASS: SQLite history and prompts survive application restart; profiles unchanged.')


if __name__ == '__main__':
    main()
