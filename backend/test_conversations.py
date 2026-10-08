from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, now
from backend.kugou import RemoteError


class ConversationTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / 'chat.sqlite3')
        self.config = {'TESTING': True, 'DATABASE': self.path, 'SEED_DEMO': False, 'PET_CHAT_MODE': 'local'}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.first = self.client.get('/api/messages').json['conversationId']

    def test_create_select_continue_and_restart(self):
        self.client.post('/api/chat', json={'message': '第一段想聊工作', 'conversationId': self.first})
        created = self.client.post('/api/conversations', json={})
        self.assertEqual(created.status_code, 201)
        second = created.json['conversationId']
        self.assertNotEqual(second, self.first)
        self.assertEqual(created.json['messages'], [])
        self.client.post('/api/chat', json={'message': '第二段想听轻音乐', 'conversationId': second})
        selected = self.client.post(f'/api/conversations/{self.first}/select').json
        self.assertEqual(selected['messages'][0]['content'], '第一段想聊工作')
        self.assertEqual(len(selected['messages']), 2)
        self.client.post('/api/chat', json={'message': '接着聊第一段', 'conversationId': self.first})
        listing = self.client.get('/api/conversations').json
        self.assertEqual(listing['activeConversationId'], self.first)
        counts = {item['id']: item['messageCount'] for item in listing['conversations']}
        self.assertEqual(counts, {self.first: 4, second: 2})
        self.assertEqual(listing['conversations'][0]['title'], '第一段想聊工作')
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get('/api/messages').json['conversationId'], self.first)
        self.assertEqual(len(restarted.get('/api/messages').json['messages']), 4)
        self.assertEqual(restarted.get(f'/api/messages?conversationId={second}').json['messages'][0]['content'], '第二段想听轻音乐')

    def test_model_context_is_scoped_and_request_id_wins_over_active_selection(self):
        upstream = self.app.extensions['kugou']
        upstream.local_mode = False
        upstream.enabled = True
        with patch.object(upstream, 'chat', return_value={'reply': '我在认真听', 'songs': [], 'quickCommands': []}) as model:
            self.client.post('/api/chat', json={'message': '第一段秘密', 'conversationId': self.first})
            second = self.client.post('/api/conversations').json['conversationId']
            self.client.post('/api/chat', json={'message': '第二段全新开头', 'conversationId': second})
            self.assertEqual(model.call_args.kwargs['history'], [])
            self.assertEqual(model.call_args.kwargs['session_id'], second)
            # A different tab selected second; this tab can still send to first.
            self.client.post('/api/chat', json={'message': '继续', 'conversationId': self.first})
            history = model.call_args.kwargs['history']
            self.assertEqual(history[0]['content'], '第一段秘密')
            self.assertNotIn('第二段全新开头', str(history))
            self.assertEqual(model.call_args.kwargs['session_id'], self.first)
            self.assertEqual(self.client.get('/api/messages').json['conversationId'], second)
            self.assertEqual(len(self.client.get('/api/messages').json['messages']), 2)

    def test_error_does_not_write_and_unknown_session_rejected(self):
        upstream = self.app.extensions['kugou']
        upstream.local_mode = False
        upstream.enabled = True
        with patch.object(upstream, 'chat', side_effect=RemoteError('chat', 'timeout')):
            self.assertEqual(self.client.post('/api/chat', json={'message': '失败测试', 'conversationId': self.first}).status_code, 503)
        self.assertEqual(self.client.get('/api/messages').json['messages'], [])
        self.assertEqual(self.client.post('/api/chat', json={'message': '测试', 'conversationId': 'unknown'}).status_code, 400)
        self.assertEqual(self.client.post('/api/conversations/unknown/select').status_code, 400)
        self.assertEqual(self.client.get('/api/messages?conversationId=unknown').status_code, 400)

    def test_old_database_migrates_without_losing_messages(self):
        legacy_path = str(Path(self.path).with_name('legacy.sqlite3'))
        with sqlite3.connect(legacy_path) as db:
            db.executescript("""CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
                INSERT INTO app_meta VALUES ('chat_session_id','legacy-session');
                CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL,
                content TEXT NOT NULL,songs TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'local');""")
            db.execute("INSERT INTO messages(role,content,created_at,source) VALUES ('user','旧消息要保留',?,'kugou')", (now().isoformat(),))
        config = {**self.config, 'DATABASE': legacy_path}
        client = create_app(config).test_client()
        self.assertEqual(client.get('/api/messages').json['conversationId'], 'legacy-session')
        self.assertEqual(client.get('/api/messages').json['messages'][0]['content'], '旧消息要保留')
        new_id = client.post('/api/conversations').json['conversationId']
        restarted = create_app(config).test_client()
        self.assertEqual(restarted.get('/api/messages').json['conversationId'], new_id)
        self.assertEqual(restarted.get('/api/messages').json['messages'], [])
        old = restarted.post('/api/conversations/legacy-session/select').json
        self.assertEqual(old['messages'][0]['content'], '旧消息要保留')
