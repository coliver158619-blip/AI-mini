from io import BytesIO
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app


class PersonalitySiteTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.config = {'TESTING': True, 'DATABASE': str(Path(temporary.name) / 'app.sqlite3'),
                       'SEED_DEMO': False, 'PET_CHAT_MODE': 'local',
                       'PERSONALITY_SITE_URL': 'https://example.test', 'PERSONALITY_SITE_SYNC_TOKEN': 'test-only-token'}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.sync = self.app.extensions['personality_site_sync']

    @staticmethod
    def acknowledge(request, **kwargs):
        return BytesIO(json.dumps({'synced': True, 'revision': json.loads(request.data)['revision']}).encode())

    def test_syncs_only_committed_selection_and_keeps_revision_on_restart(self):
        with patch('backend.personality_site.urlopen', side_effect=self.acknowledge) as send:
            self.assertTrue(self.sync.sync_once())
            self.assertTrue(self.sync.sync_once())
            self.assertEqual(send.call_count, 1)
            request = send.call_args.args[0]
            self.assertEqual(request.full_url, 'https://example.test/api/personality/image')
            self.assertEqual(request.get_header('Authorization'), 'Bearer test-only-token')
            self.assertEqual(json.loads(request.data), {'personalityId': 'INFP', 'revision': 0})
            self.client.get('/api/personality/image?personalityId=ENFP')
            self.client.post('/api/personality', json={'personalityId': 'bad'})
            self.sync.sync_once()
            self.assertEqual(send.call_count, 1)
            self.client.post('/api/personality', json={'personalityId': 'ENFP'})
            self.sync.sync_once()
            self.assertEqual(json.loads(send.call_args.args[0].data), {'personalityId': 'ENFP', 'revision': 1})
            restarted = create_app(self.config).extensions['personality_site_sync']
            restarted.sync_once()
            self.assertEqual(json.loads(send.call_args.args[0].data), {'personalityId': 'ENFP', 'revision': 1})

    def test_retry_sends_latest_selection_without_failing_local_save(self):
        self.client.post('/api/personality', json={'personalityId': 'ENTJ'})
        with patch('backend.personality_site.urlopen', side_effect=OSError('offline')):
            with self.assertRaises(OSError):
                self.sync.sync_once()
        self.assertIsNone(self.sync.last_revision)
        response = self.client.post('/api/outfit', json={'outfitId': 'zsh08'})
        self.assertEqual(response.status_code, 200)
        with patch('backend.personality_site.urlopen', side_effect=self.acknowledge) as send:
            self.sync.sync_once()
            self.assertEqual(json.loads(send.call_args.args[0].data), {'personalityId': 'zsh08', 'revision': 2})

    def test_bad_acknowledgement_is_not_marked_synced_and_missing_config_stays_local(self):
        with patch('backend.personality_site.urlopen', return_value=BytesIO(b'{"synced":true,"revision":99}')):
            with self.assertRaises(ValueError):
                self.sync.sync_once()
        self.assertIsNone(self.sync.last_revision)
        local = create_app({**self.config, 'PERSONALITY_SITE_URL': '', 'PERSONALITY_SITE_SYNC_TOKEN': ''})
        with patch('backend.personality_site.urlopen') as send:
            self.assertFalse(local.extensions['personality_site_sync'].sync_once())
            send.assert_not_called()


if __name__ == '__main__':
    unittest.main()
