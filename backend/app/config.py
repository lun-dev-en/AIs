from dataclasses import dataclass
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')


@dataclass(frozen=True)
class Settings:
    database_path: Path = ROOT / 'data' / 'personality-lab.sqlite3'
    ollama_url: str = 'http://127.0.0.1:11434'
    model: str = 'qwen3:8b'
    num_ctx: int = 8192
    num_predict: int = 512
    timeout: float = 300

    def __post_init__(self):
        url = urlparse(self.ollama_url)
        if (url.scheme != 'http' or url.hostname not in {'localhost', '127.0.0.1', '::1'}
                or url.username or url.password or url.path not in {'', '/'}
                or url.query or url.fragment):
            raise ValueError('OLLAMA_BASE_URL はローカルの HTTP アドレスを指定してください。')
        if not self.model.strip() or 'cloud' in self.model.lower() or '/' in self.model:
            raise ValueError('OLLAMA_MODEL にはローカルに取得したモデル名を指定してください。')
        if not 2048 <= self.num_ctx <= 131072 or not 128 <= self.num_predict <= 4096:
            raise ValueError('コンテキスト長または出力上限が範囲外です。')
        if self.num_ctx - self.num_predict < 1536 or self.timeout <= 0:
            raise ValueError('入力用のコンテキスト長またはタイムアウト設定を確認してください。')

    @classmethod
    def from_env(cls):
        return cls(
            database_path=Path(os.getenv('DATABASE_PATH', str(ROOT / 'data' / 'personality-lab.sqlite3'))),
            ollama_url=os.getenv('OLLAMA_BASE_URL', 'http://127.0.0.1:11434').rstrip('/'),
            model=os.getenv('OLLAMA_MODEL', 'qwen3:8b'),
            num_ctx=int(os.getenv('OLLAMA_NUM_CTX', '8192')),
            num_predict=int(os.getenv('OLLAMA_NUM_PREDICT', '512')),
            timeout=float(os.getenv('OLLAMA_TIMEOUT', '300')),
        )
