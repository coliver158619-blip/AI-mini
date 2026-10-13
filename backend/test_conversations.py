import tempfile
import unittest
from pathlib import Path
from backend.app import create_app


class ConversationTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = {'TESTING': True, 'DATABASE': str(Path(self.directory.name) / 'chat.sqlite3'), 'SEED_DEMO': False, 'PET_CHAT_MODE': 'local'}
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def test_new_history_scope_and_restart(self):
        first = self.client.get('/api/messages').json['conversationId']
        self.client.post('/api/chat', json={'message': '第一段心情', 'conversationId': first})
        second = self.client.post('/api/conversations').json['conversationId']
        self.assertEqual(self.client.get('/api/messages').json['messages'], [])
        self.client.post('/api/chat', json={'message': '第二段心情', 'conversationId': second})
        saved = self.client.post(f'/api/conversations/{first}/select').json
        self.assertEqual(len(saved['messages']), 2)
        self.assertEqual(saved['messages'][0]['content'], '第一段心情')
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get('/api/messages').json, saved)
        self.assertEqual(len(restarted.get('/api/conversations').json['conversations']), 2)

    def test_unknown_session_does_not_write_or_change_selection(self):
        before = self.client.get('/api/messages').json
        self.assertEqual(self.client.post('/api/conversations/missing/select').status_code, 400)
        self.assertEqual(self.client.post('/api/chat', json={'message': '你好', 'conversationId': 'missing'}).status_code, 400)
        self.assertEqual(self.client.get('/api/messages').json, before)
