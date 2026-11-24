from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3

SCHEMA = '''
CREATE TABLE IF NOT EXISTS profile (
    personality_id INTEGER PRIMARY KEY AUTOINCREMENT,
    personality_name TEXT NOT NULL UNIQUE,
    personality1 TEXT NOT NULL,
    personality2 TEXT
);
CREATE TABLE IF NOT EXISTS past_memories (
    memory_id INTEGER PRIMARY KEY AUTOINCREMENT,
    personality_id INTEGER NOT NULL REFERENCES profile(personality_id) ON DELETE CASCADE,
    past_memory TEXT NOT NULL,
    think TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS formed_personalities (
    formed_id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id INTEGER NOT NULL REFERENCES past_memories(memory_id) ON DELETE CASCADE,
    formed_personality TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
    question_id INTEGER PRIMARY KEY AUTOINCREMENT,
    question TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'generating',
    error TEXT,
    settings_json TEXT NOT NULL,
    parent_question_id INTEGER REFERENCES questions(question_id)
);
CREATE TABLE IF NOT EXISTS responses (
    response_id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    personality_id INTEGER NOT NULL REFERENCES profile(personality_id),
    response TEXT NOT NULL,
    prompt TEXT NOT NULL,
    model_name TEXT NOT NULL,
    temperature REAL NOT NULL,
    seed INTEGER NOT NULL,
    created_at DATETIME NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    metadata_json TEXT NOT NULL,
    UNIQUE(question_id, personality_id)
);
CREATE INDEX IF NOT EXISTS memories_profile ON past_memories(personality_id);
CREATE INDEX IF NOT EXISTS formed_memory ON formed_personalities(memory_id);
CREATE INDEX IF NOT EXISTS response_question ON responses(question_id);
'''


class Database:
    def __init__(self, path: Path):
        self.path = path

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def initialize(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.execute('PRAGMA journal_mode=WAL')
            con.executescript(SCHEMA)
            if con.execute('SELECT COUNT(*) FROM profile').fetchone()[0] == 0:
                con.executemany(
                    'INSERT INTO profile(personality_name, personality1, personality2) VALUES(?,?,?)',
                    [('ハル', '明るい', '好奇心旺盛'), ('ナツ', '負けず嫌い', '行動的'),
                     ('アキ', '冷静', '慎重'), ('フユ', '優しい', '内向的')],
                )
            con.execute("UPDATE questions SET status='failed', error=? WHERE status='generating'",
                        ('サーバーの停止により生成が中断されました。再生成してください。',))
            con.execute("UPDATE responses SET status='error', error=? WHERE status IN ('pending','generating')",
                        ('サーバーの停止により生成が中断されました。再生成してください。',))

    def one(self, sql, params=()):
        with self.connect() as con:
            row = con.execute(sql, params).fetchone()
            return dict(row) if row else None

    def all(self, sql, params=()):
        with self.connect() as con:
            return [dict(row) for row in con.execute(sql, params)]

    def execute(self, sql, params=()):
        with self.connect() as con:
            cursor = con.execute(sql, params)
            return cursor.lastrowid

    def profiles(self):
        # A single read transaction snapshots all four profiles and their related data.
        with self.connect() as con:
            con.execute('BEGIN')
            profiles = [dict(row) for row in con.execute('SELECT * FROM profile ORDER BY personality_id')]
            for profile in profiles:
                memories = [dict(row) for row in con.execute(
                    'SELECT * FROM past_memories WHERE personality_id=? ORDER BY memory_id',
                    (profile['personality_id'],))]
                for memory in memories:
                    memory['formed_personalities'] = [dict(row) for row in con.execute(
                        'SELECT * FROM formed_personalities WHERE memory_id=? ORDER BY formed_id',
                        (memory['memory_id'],))]
                profile['memories'] = memories
            return profiles

    def question(self, question_id):
        question = self.one('SELECT * FROM questions WHERE question_id=?', (question_id,))
        if question:
            question['settings'] = json.loads(question.pop('settings_json'))
        return question

    def responses(self, question_id):
        responses = self.all('SELECT * FROM responses WHERE question_id=? ORDER BY personality_id', (question_id,))
        for response in responses:
            response['metadata'] = json.loads(response.pop('metadata_json'))
            response['messages'] = json.loads(response['prompt'])
        return responses
