"""Persistent conversation selection shared by the chat header controls."""
import json
import uuid
from flask import jsonify, request
from .chat_text import clean_assistant_text


def selected_id(db, value=None):
    if value is None:
        value = db.execute("SELECT value FROM app_meta WHERE key='chat_session_id'").fetchone()[0]
    if not isinstance(value, str) or not db.execute('SELECT 1 FROM conversations WHERE id=?', (value,)).fetchone():
        raise ValueError('没有找到这段对话，请重新选择。')
    return value


def init_conversations(db, at):
    with db:
        db.execute('CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
        if 'conversation_id' not in {row[1] for row in db.execute('PRAGMA table_info(messages)')}:
            db.execute('ALTER TABLE messages ADD COLUMN conversation_id TEXT REFERENCES conversations(id)')
        active = db.execute("SELECT value FROM app_meta WHERE key='chat_session_id'").fetchone()[0]
        db.execute("INSERT OR IGNORE INTO app_meta VALUES ('legacy_chat_session_id', ?)", (active,))
        legacy = db.execute("SELECT value FROM app_meta WHERE key='legacy_chat_session_id'").fetchone()[0]
        db.execute("INSERT OR IGNORE INTO conversations VALUES (?, '历史对话', ?, ?)", (active, at, at))
        db.execute('UPDATE messages SET conversation_id=? WHERE conversation_id IS NULL', (legacy,))
        db.execute('CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,id)')


def message_list(db, id_):
    legacy = db.execute("SELECT value FROM app_meta WHERE key='legacy_chat_session_id'").fetchone()[0]
    return [{"id": row['id'], "role": row['role'], "content": clean_assistant_text(row['content']) if row['role'] == 'assistant' else row['content'],
             "songs": json.loads(row['songs']), "createdAt": row['created_at'], "source": row['source']}
            for row in db.execute('SELECT * FROM messages WHERE conversation_id=? OR (conversation_id IS NULL AND ?=?) ORDER BY id', (id_, id_, legacy))]


def register_conversations(app, get_db, now):
    @app.get('/api/messages')
    def conversation_messages():
        db = get_db()
        id_ = selected_id(db, request.args.get('conversationId'))
        return jsonify(conversationId=id_, messages=message_list(db, id_))

    @app.get('/api/conversations')
    def list_conversations():
        db = get_db()
        rows = db.execute('SELECT c.*, (SELECT count(*) FROM messages WHERE conversation_id=c.id) messageCount FROM conversations c ORDER BY updated_at DESC, rowid DESC').fetchall()
        return jsonify(activeConversationId=selected_id(db), conversations=[{**dict(row), 'createdAt': row['created_at'], 'updatedAt': row['updated_at']} for row in rows])

    @app.post('/api/conversations')
    def new_conversation():
        db, id_, at = get_db(), str(uuid.uuid4()), now().isoformat()
        with db:
            db.execute("INSERT INTO conversations VALUES (?, '新对话', ?, ?)", (id_, at, at))
            db.execute("UPDATE app_meta SET value=? WHERE key='chat_session_id'", (id_,))
        return jsonify(conversationId=id_, messages=[]), 201

    @app.post('/api/conversations/<id_>/select')
    def select_conversation(id_):
        db = get_db()
        selected_id(db, id_)
        with db:
            db.execute("UPDATE app_meta SET value=? WHERE key='chat_session_id'", (id_,))
        return jsonify(conversationId=id_, messages=message_list(db, id_))
