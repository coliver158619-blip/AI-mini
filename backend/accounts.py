"""Nickname-only rooms with isolated SQLite data and revocable device sessions.

Knowing a nickname is sufficient to enter that room, by product design.
"""
import hashlib
import secrets
import sqlite3
import time
import unicodedata
import uuid
from contextlib import contextmanager, closing
from pathlib import Path
from urllib.parse import urlsplit
from flask import g, jsonify, request
from .conversations import init_conversations
from .outfits import OUTFITS
from .personalities import PERSONALITIES

COOKIE = 'music_room_session'
TTL = 30 * 24 * 3600


def nickname(value):
    if not isinstance(value, str):
        raise ValueError('请先给 AI 搭子起个昵称')
    value = unicodedata.normalize('NFKC', value).strip()
    if not 1 <= len(value) <= 16 or any(unicodedata.category(c).startswith('C') for c in value):
        raise ValueError('昵称需要 1–16 个字，不能包含换行或控制字符')
    return value


def register_accounts(app, get_db, init_db, get_profile, now):
    root = Path(app.config['DATABASE']).resolve().parent / (Path(app.config['DATABASE']).stem + '-rooms')
    registry = root / 'accounts.sqlite3'
    if app.config['AUTH_ENABLED']:
        root.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(registry, timeout=10)) as db, db:
            db.executescript('''
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY, nickname TEXT NOT NULL, name_key TEXT UNIQUE NOT NULL,
                    gender TEXT NOT NULL CHECK(gender IN ('male','female')),
                    complete INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            ''')

    @contextmanager
    def connect():
        db = sqlite3.connect(registry, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def public_user(user):
        return dict(id=user['id'], nickname=user['nickname'], gender=user['gender'], onboardingComplete=bool(user['complete']))

    def bind(user):
        g.room_user = dict(user)
        g.user_database = str(root / (user['id'] + '.sqlite3'))

    def reject(message, status=401, code='LOGIN_REQUIRED'):
        return jsonify(error=message, code=code), status

    @app.before_request
    def protect_room():
        if not app.config['AUTH_ENABLED'] or not request.path.startswith('/api/'):
            return
        if request.method not in ('GET', 'HEAD', 'OPTIONS'):
            origin = request.headers.get('Origin')
            if request.headers.get('Sec-Fetch-Site') == 'cross-site' or (origin and urlsplit(origin).netloc != request.host):
                return reject('请从音乐小屋页面进行操作', 403, 'INVALID_ORIGIN')
        token = request.cookies.get(COOKIE, '')
        user = None
        if token:
            with connect() as db:
                user = db.execute('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?',
                                  (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
        if user:
            bind(user)
        expected = request.headers.get('X-Music-User')
        if user and expected and expected != user['id']:
            return reject('当前小屋已切换，请重新进入', 409, 'ACCOUNT_CHANGED')
        public = {'/api/health', '/api/auth/session', '/api/auth/login', '/api/auth/logout'}
        if request.path in public:
            return
        if not user:
            return reject('先输入昵称，回到你的音乐小屋吧')
        body = request.get_json(silent=True) if request.method == 'POST' else None
        expected = request.headers.get('X-Music-User') or (body.get('_accountId') if isinstance(body, dict) else None)
        if expected and expected != user['id']:
            return reject('当前小屋已切换，请重新进入', 409, 'ACCOUNT_CHANGED')

    @app.get('/api/auth/session')
    def session():
        if not app.config['AUTH_ENABLED']:
            return jsonify(enabled=False, user=None)
        user = getattr(g, 'room_user', None)
        return jsonify(enabled=True, user=public_user(user) if user else None,
                       profile=get_profile() if user and not user['complete'] else None)

    @app.post('/api/auth/login')
    def login():
        if not app.config['AUTH_ENABLED']:
            return reject('昵称入口未启用', 404)
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise ValueError('请填写昵称和形象性别')
        name = nickname(body.get('nickname'))
        with connect() as db:
            # Serializes simultaneous first visits, including identical nicknames on two devices.
            db.execute('BEGIN IMMEDIATE')
            user = db.execute('SELECT * FROM users WHERE name_key=?', (name.casefold(),)).fetchone()
            is_new = user is None
            if is_new:
                gender = body.get('gender')
                if gender not in ('male', 'female'):
                    raise ValueError('第一次见面，先为搭子选择男生或女生吧')
                identifier = uuid.uuid4().hex
                target = root / (identifier + '.sqlite3')
                init_db(app, target=target, seed_demo=False)
                with closing(sqlite3.connect(target, timeout=10)) as room, room:
                    room.row_factory = sqlite3.Row
                    init_conversations(room, now().isoformat())
                    character = 'lyn' if gender == 'male' else 'zsh'
                    pool = [('personality', item) for item in PERSONALITIES if item['gender'] == gender]
                    pool += [('outfit', item) for item in OUTFITS if item['characterId'] == character and item['unlockMethod'] == 'free']
                    mode, item = secrets.choice(pool)
                    room.execute('UPDATE profile SET name=? WHERE id=1', (name,))
                    room.execute("UPDATE app_meta SET value=? WHERE key='appearance_mode'", (mode,))
                    room.execute('UPDATE app_meta SET value=? WHERE key=?', (item['id'], mode + '_id'))
                    if mode == 'outfit':
                        room.execute('UPDATE app_meta SET value=? WHERE key=?', (item['id'], 'outfit_' + character))
                    # Unlocks remain empty; the catalog exposes only its six free outfits.
                db.execute('INSERT INTO users VALUES (?,?,?,?,0,?)', (identifier, name, name.casefold(), gender, now().isoformat()))
                user = db.execute('SELECT * FROM users WHERE id=?', (identifier,)).fetchone()
            token = secrets.token_urlsafe(32)
            db.execute('DELETE FROM sessions WHERE expires_at<=?', (int(time.time()),))
            db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], int(time.time()) + TTL))
        bind(user)
        response = jsonify(user=public_user(user), profile=get_profile(), isNew=is_new)
        response.set_cookie(COOKIE, token, max_age=TTL, httponly=True,
                            secure=request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https', samesite='Lax', path='/')
        return response

    @app.post('/api/auth/complete')
    def complete():
        if not app.config['AUTH_ENABLED']:
            return reject('昵称入口未启用', 404)
        with connect() as db:
            db.execute('UPDATE users SET complete=1 WHERE id=?', (g.room_user['id'],))
        g.room_user['complete'] = 1
        return jsonify(user=public_user(g.room_user))

    @app.post('/api/auth/logout')
    def logout():
        if app.config['AUTH_ENABLED']:
            token = request.cookies.get(COOKIE, '')
            with connect() as db:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
        response = jsonify(ok=True)
        response.delete_cookie(COOKIE, path='/', httponly=True, samesite='Lax')
        return response

    def rename_room(room, value):
        if not app.config['AUTH_ENABLED']:
            return value
        value = nickname(value)
        room.execute('ATTACH DATABASE ? AS room_accounts', (str(registry),))
        try:
            room.execute('UPDATE room_accounts.users SET nickname=?,name_key=? WHERE id=?',
                         (value, value.casefold(), g.room_user['id']))
        except sqlite3.IntegrityError:
            raise ValueError('这个昵称已经有小屋了，换一个昵称吧') from None
        return value

    app.extensions['rename_room'] = rename_room
    def room_databases():
        if not app.config['AUTH_ENABLED']:
            return []
        with connect() as db:
            return [root / (row['id'] + '.sqlite3') for row in db.execute('SELECT id FROM users')]
    app.extensions['room_databases'] = room_databases
