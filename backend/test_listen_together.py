from pathlib import Path
import tempfile
import unittest
from backend.app import create_app


class ListenTogetherTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.app = create_app(dict(TESTING=True, DATABASE=str(Path(temp.name) / 'test.sqlite3'),
                                   SEED_DEMO=False, PET_CHAT_MODE='local', TOGETHER_LISTEN_URL=''))
        self.client = self.app.test_client()

    def test_unconfigured_entry_does_not_navigate_or_change_selection(self):
        before = self.client.get('/api/widget/appearance').json
        response = self.client.get('/api/listen-together/entry')
        self.assertEqual(response.json, dict(available=False, url=None))
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        self.assertEqual(self.client.get('/api/widget/appearance').json, before)

    def test_configured_https_or_local_path_and_invalid_targets(self):
        for url in ('https://music.example.test/together?from=space', '/listen-together?from=space'):
            self.app.config['TOGETHER_LISTEN_URL'] = url
            self.assertEqual(self.client.get('/api/listen-together/entry').json, dict(available=True, url=url))
        for url in ('javascript:alert(1)', '//example.test', '/\\example.test', 'http://example.test', 'https://', 'https://user:pass@example.test', '/path\nnext'):
            self.app.config['TOGETHER_LISTEN_URL'] = url
            self.assertEqual(self.client.get('/api/listen-together/entry').status_code, 503, url)


if __name__ == '__main__':
    unittest.main()
