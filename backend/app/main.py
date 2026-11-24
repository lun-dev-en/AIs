import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
import logging
import sqlite3
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .config import Settings
from .database import Database
from .demo_data import load_demo_data
from .ollama import Ollama, OllamaError
from .prompts import PromptTooLarge, build_prompt
from .schemas import CompareInput, FormedInput, MemoryInput, ProfileInput


def now():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False)


def create_app(settings: Settings | None = None, llm=None):
    settings = settings or Settings.from_env()
    databases = {'normal': Database(settings.database_path), 'demo': Database(settings.demo_path)}
    llm = llm or Ollama(settings)

    @asynccontextmanager
    async def lifespan(app):
        for database in databases.values():
            database.initialize()
        load_demo_data(databases['demo'])
        app.state.lock = asyncio.Lock()
        app.state.tasks = set()
        app.state.active_question_id = None
        app.state.active_mode = None
        yield
        for task in app.state.tasks:
            task.cancel()
        await asyncio.gather(*app.state.tasks, return_exceptions=True)

    app = FastAPI(title='Personality Lab', lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.db = databases['normal']
    app.state.databases = databases
    app.state.settings = settings
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['localhost', '127.0.0.1', '[::1]', 'testserver'])

    @app.middleware('http')
    async def local_origin(request: Request, call_next):
        origin = request.headers.get('origin')
        if origin and origin not in {
            'http://127.0.0.1:3000', 'http://localhost:3000',
            'http://127.0.0.1:8000', 'http://localhost:8000',
            settings.frontend_origin,
        }:
            return JSONResponse({'detail': 'ローカル画面から操作してください。'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Lab-Mode'] = request.headers.get('x-lab-mode', 'normal')
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        fields = ['.'.join(str(x) for x in e['loc'][1:]) for e in exc.errors()]
        return JSONResponse({'detail': '入力内容を確認してください。必須項目・文字数・数値の範囲が不正です。',
                             'fields': fields}, status_code=422)

    @app.exception_handler(sqlite3.IntegrityError)
    async def integrity_error(request, exc):
        return JSONResponse({'detail': '同じ名前の人格が存在するか、関連データが変更されています。'}, status_code=409)

    def get_mode(x_lab_mode: Literal['normal', 'demo'] = Header(default='normal')):
        return x_lab_mode

    def get_db(mode: str = Depends(get_mode)):
        return databases[mode]

    def require(db, table, key, value):
        # Table and key are fixed internal literals, never model or user input.
        row = db.one(f'SELECT * FROM {table} WHERE {key}=?', (value,))
        if row is None:
            raise HTTPException(404, '指定されたデータが見つかりません。')
        return row

    @app.get('/api/personalities')
    def personalities(db: Database = Depends(get_db)):
        return db.profiles()

    @app.get('/api/personalities/{personality_id}')
    def personality(personality_id: int, db: Database = Depends(get_db)):
        require(db, 'profile', 'personality_id', personality_id)
        return next(p for p in db.profiles() if p['personality_id'] == personality_id)

    @app.put('/api/personalities/{personality_id}')
    def update_personality(personality_id: int, data: ProfileInput, db: Database = Depends(get_db)):
        require(db, 'profile', 'personality_id', personality_id)
        db.execute('UPDATE profile SET personality_name=?, personality1=?, personality2=? WHERE personality_id=?',
                   (data.personality_name, data.personality1, data.personality2, personality_id))
        return personality(personality_id, db)

    @app.get('/api/personalities/{personality_id}/memories')
    def memories(personality_id: int, db: Database = Depends(get_db)):
        return personality(personality_id, db)['memories']

    @app.post('/api/personalities/{personality_id}/memories', status_code=201)
    def create_memory(personality_id: int, data: MemoryInput, db: Database = Depends(get_db)):
        require(db, 'profile', 'personality_id', personality_id)
        memory_id = db.execute('INSERT INTO past_memories(personality_id, past_memory, think) VALUES(?,?,?)',
                               (personality_id, data.past_memory, data.think))
        return {**require(db, 'past_memories', 'memory_id', memory_id), 'formed_personalities': []}

    @app.put('/api/memories/{memory_id}')
    def update_memory(memory_id: int, data: MemoryInput, db: Database = Depends(get_db)):
        require(db, 'past_memories', 'memory_id', memory_id)
        db.execute('UPDATE past_memories SET past_memory=?, think=? WHERE memory_id=?',
                   (data.past_memory, data.think, memory_id))
        return require(db, 'past_memories', 'memory_id', memory_id)

    @app.delete('/api/memories/{memory_id}', status_code=204)
    def delete_memory(memory_id: int, db: Database = Depends(get_db)):
        require(db, 'past_memories', 'memory_id', memory_id)
        db.execute('DELETE FROM past_memories WHERE memory_id=?', (memory_id,))

    @app.post('/api/memories/{memory_id}/formed-personalities', status_code=201)
    def create_formed(memory_id: int, data: FormedInput, db: Database = Depends(get_db)):
        require(db, 'past_memories', 'memory_id', memory_id)
        formed_id = db.execute('INSERT INTO formed_personalities(memory_id, formed_personality) VALUES(?,?)',
                              (memory_id, data.formed_personality))
        return require(db, 'formed_personalities', 'formed_id', formed_id)

    @app.put('/api/formed-personalities/{formed_id}')
    def update_formed(formed_id: int, data: FormedInput, db: Database = Depends(get_db)):
        require(db, 'formed_personalities', 'formed_id', formed_id)
        db.execute('UPDATE formed_personalities SET formed_personality=? WHERE formed_id=?',
                   (data.formed_personality, formed_id))
        return require(db, 'formed_personalities', 'formed_id', formed_id)

    @app.delete('/api/formed-personalities/{formed_id}', status_code=204)
    def delete_formed(formed_id: int, db: Database = Depends(get_db)):
        require(db, 'formed_personalities', 'formed_id', formed_id)
        db.execute('DELETE FROM formed_personalities WHERE formed_id=?', (formed_id,))

    async def generate(db, question_id, prepared, data):
        try:
            for profile, messages, metadata in prepared:
                pid = profile['personality_id']
                db.execute("UPDATE responses SET status='generating' WHERE question_id=? AND personality_id=?",
                           (question_id, pid))
                try:
                    answer = await llm.generate(messages, data.temperature, data.seed)
                    db.execute("UPDATE responses SET response=?, status='complete', created_at=? WHERE question_id=? AND personality_id=?",
                               (answer, now(), question_id, pid))
                except OllamaError as exc:
                    db.execute("UPDATE responses SET status='error', error=?, created_at=? WHERE question_id=? AND personality_id=?",
                               (str(exc), now(), question_id, pid))
            results = db.responses(question_id)
            successes = sum(r['status'] == 'complete' for r in results)
            status = 'complete' if successes == 4 else ('partial' if successes else 'failed')
            db.execute('UPDATE questions SET status=?, error=? WHERE question_id=?',
                       (status, None if successes == 4 else '一部またはすべての回答を生成できませんでした。各カードを確認してください。', question_id))
        except BaseException as exc:
            if not isinstance(exc, asyncio.CancelledError):
                logging.getLogger(__name__).exception('Comparison job failed')
            message = ('サーバーの停止により生成が中断されました。' if isinstance(exc, asyncio.CancelledError)
                       else '生成処理でエラーが発生しました。サーバーの状態を確認し、再生成してください。')
            db.execute("UPDATE responses SET status='error', error=? WHERE question_id=? AND status IN ('pending','generating')",
                       (message, question_id))
            db.execute("UPDATE questions SET status='failed', error=? WHERE question_id=?", (message, question_id))
            if isinstance(exc, asyncio.CancelledError):
                raise
        finally:
            app.state.active_question_id = None
            app.state.active_mode = None
            app.state.lock.release()

    @app.post('/api/compare', status_code=202)
    async def compare(data: CompareInput, db: Database = Depends(get_db), mode: str = Depends(get_mode)):
        if app.state.lock.locked():
            raise HTTPException(409, '回答を生成中です。完了してから再度お試しください。')
        await app.state.lock.acquire()
        try:
            if data.parent_question_id is not None:
                require(db, 'questions', 'question_id', data.parent_question_id)
            profiles = db.profiles()
            prepared = []
            for profile in profiles:
                messages, metadata = build_prompt(profile, data.question, data.conditions, settings)
                prepared.append((profile, messages, metadata))
            await llm.check()
            run_settings = {**data.model_dump(exclude={'question', 'parent_question_id'}),
                            'model_name': settings.model, 'num_ctx': settings.num_ctx,
                            'num_predict': settings.num_predict}
            with db.connect() as con:
                cursor = con.execute('INSERT INTO questions(question,created_at,settings_json,parent_question_id) VALUES(?,?,?,?)',
                                     (data.question, now(), encode(run_settings), data.parent_question_id))
                question_id = cursor.lastrowid
                for profile, messages, metadata in prepared:
                    con.execute('''INSERT INTO responses(question_id,personality_id,response,prompt,model_name,
                        temperature,seed,created_at,status,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)''',
                        (question_id, profile['personality_id'], '', encode(messages), settings.model,
                         data.temperature, data.seed, now(), 'pending', encode(metadata)))
            app.state.active_question_id = question_id
            app.state.active_mode = mode
            task = asyncio.create_task(generate(db, question_id, prepared, data))
            app.state.tasks.add(task)
            task.add_done_callback(app.state.tasks.discard)
            return db.question(question_id)
        except BaseException as exc:
            app.state.lock.release()
            if isinstance(exc, OllamaError):
                raise HTTPException(503, str(exc)) from exc
            if isinstance(exc, PromptTooLarge):
                raise HTTPException(422, str(exc)) from exc
            raise

    @app.get('/api/questions')
    def questions(limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0), db: Database = Depends(get_db)):
        rows = db.all('SELECT * FROM questions ORDER BY question_id DESC LIMIT ? OFFSET ?', (limit, offset))
        for row in rows:
            row['settings'] = json.loads(row.pop('settings_json'))
        return rows

    @app.get('/api/questions/{question_id}/responses')
    def responses(question_id: int, db: Database = Depends(get_db)):
        require(db, 'questions', 'question_id', question_id)
        return {'question': db.question(question_id), 'responses': db.responses(question_id)}

    @app.get('/api/health')
    async def health(db: Database = Depends(get_db), mode: str = Depends(get_mode)):
        db.one('SELECT COUNT(*) AS count FROM profile')
        status = {'mode': mode, 'generation_busy': app.state.lock.locked(),
                  'active_question_id': app.state.active_question_id if app.state.active_mode == mode else None}
        try:
            models = await llm.check()
            return {'ready': True, 'model_name': settings.model, 'models': models,
                    **status, 'error': None}
        except OllamaError as exc:
            return {'ready': False, 'model_name': settings.model, 'models': [],
                    **status, 'error': str(exc)}

    return app


app = create_app()
