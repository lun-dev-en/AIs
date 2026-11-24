import httpx

from .config import Settings


class OllamaError(Exception):
    pass


class Ollama:
    def __init__(self, settings: Settings):
        self.settings = settings

    def client(self):
        return httpx.AsyncClient(base_url=self.settings.ollama_url,
                                 timeout=self.settings.timeout, trust_env=False, follow_redirects=False)

    async def check(self):
        try:
            async with self.client() as client:
                tags = await client.get('/api/tags', timeout=5)
                tags.raise_for_status()
                models = [m['name'] for m in tags.json().get('models', [])]
                name = self.settings.model
                if name not in models and f'{name}:latest' not in models:
                    raise OllamaError(f'モデル「{name}」がありません。ollama pull {name} を実行してください。')
                info = await client.post('/api/show', json={'model': name}, timeout=10)
                info.raise_for_status()
                data = info.json()
                if data.get('remote_host') or data.get('remote_model'):
                    raise OllamaError('クラウドモデルは使用できません。ローカルモデルを指定してください。')
                return models
        except OllamaError:
            raise
        except httpx.TimeoutException as exc:
            raise OllamaError('Ollamaの接続確認がタイムアウトしました。起動状態を確認してください。') from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise OllamaError('Ollamaに接続できません。Ollamaを起動し、接続先を確認してください。') from exc

    async def generate(self, messages, temperature, seed):
        try:
            async with self.client() as client:
                result = await client.post('/api/chat', json={
                    'model': self.settings.model,
                    'messages': messages,
                    'stream': False,
                    'think': False,
                    'keep_alive': '5m',
                    'options': {'temperature': temperature, 'seed': seed,
                                'num_ctx': self.settings.num_ctx, 'num_predict': self.settings.num_predict},
                })
                if result.status_code == 404:
                    raise OllamaError(f'モデルが見つかりません。ollama pull {self.settings.model} を実行してください。')
                result.raise_for_status()
                data = result.json()
                content = data['message']['content'].strip()
                if not content:
                    raise OllamaError('モデルから空の回答が返されました。出力上限やモデルを確認してください。')
                if data.get('done_reason') == 'length':
                    raise OllamaError('出力上限に達しました。OLLAMA_NUM_PREDICT を増やして再生成してください。')
                return content
        except OllamaError:
            raise
        except httpx.TimeoutException as exc:
            raise OllamaError('回答生成がタイムアウトしました。軽量モデルへの切り替え、または OLLAMA_TIMEOUT の延長をお試しください。') from exc
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise OllamaError('Ollamaの回答生成に失敗しました。モデルとメモリ使用量を確認してください。') from exc
