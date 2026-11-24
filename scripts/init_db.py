"""Idempotent database initialization. Run only while the app is stopped."""
from pathlib import Path
import socket
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app.config import Settings
from app.database import Database

with socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 8000)) == 0:
        sys.exit('初期化の前に、実行中のバックエンドを停止してください。')
settings = Settings.from_env()
Database(settings.database_path).initialize()
print(f'データベースを準備しました: {settings.database_path}')
