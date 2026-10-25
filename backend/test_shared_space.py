from datetime import timedelta
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, now
from backend.kugou import RemoteError

MEMORY = '我们把一起散步的时光记在这一页里，聊着今天的小事，心也慢慢靠近。那些平常却温暖的片刻，成了值得收藏的共同经历。\n\n不需要特别的安排，有彼此陪在身边，这段路就有了不同的意义。让我们把这份轻松留住，以后再翻开时，也能记得一起走过的心情。'


class SharedSpaceTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = str(Path(temp.name) / 'test.sqlite3')
        self.config = dict(TESTING=True, DATABASE=self.path, SEED_DEMO=False, PET_CHAT_MODE='local')
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.day = now().date().isoformat()
        self.url = '/api/shared-diary/' + self.day
        self.upstream = self.app.extensions['kugou']

    def save(self, **overrides):
        return self.client.put(self.url, json=dict(note='我们一起散步，聊今天的小事。', body='', revision=0, **overrides))

    def test_save_past_edit_restart_and_personal_diary_isolation(self):
        before = self.client.get('/api/diary').json
        self.url = '/api/shared-diary/' + (now().date() - timedelta(days=3)).isoformat()
        first = self.save().json['entry']
        edited = self.client.put(self.url, json=dict(note=first['note'], body='我们一起写下的日记。', revision=first['revision']))
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.json['entry']['revision'], 2)
        entries = create_app(self.config).test_client().get('/api/shared-diary').json['entries']
        self.assertEqual(entries[-1]['body'], '我们一起写下的日记。')
        self.assertEqual(self.client.get('/api/diary').json, before)
        self.assertEqual(self.save().status_code, 409)

    def test_invalid_inputs_and_unavailable_ai_keep_saved_words(self):
        for data in ({}, dict(note=3, body='', revision=0), dict(note='x'*3001, body='', revision=0), dict(note='', body='', revision=True)):
            self.assertEqual(self.client.put(self.url, json=data).status_code, 400)
        future = (now().date() + timedelta(days=1)).isoformat()
        self.assertEqual(self.client.put('/api/shared-diary/' + future, json=dict(note='', body='', revision=0)).status_code, 400)
        self.save()
        self.assertEqual(self.client.post(self.url + '/story', json=dict(revision=1)).status_code, 503)
        self.assertIn('一起散步', self.client.get('/api/shared-diary').json['entries'][0]['note'])

    def test_ai_generation_manual_edit_and_failed_regeneration(self):
        self.save()
        self.upstream.enabled, self.upstream.local_mode = True, False
        with patch.object(self.upstream, 'chat', return_value=dict(reply=MEMORY)) as model:
            response = self.client.post(self.url + '/story', json=dict(revision=1))
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['entry']['body'], MEMORY)
            self.assertFalse(model.call_args.kwargs['recommend'])
        saved = response.json['entry']
        saved['body'] = '我们亲手修改后的回忆。'
        response = self.client.put(self.url, json=saved)
        self.assertEqual(response.json['entry']['source'], 'manual')
        with patch.object(self.upstream, 'chat', side_effect=RemoteError('chat', 'network')):
            self.assertEqual(self.client.post(self.url + '/story', json=dict(revision=3)).status_code, 503)
        self.assertEqual(self.client.get('/api/shared-diary').json['entries'][0]['body'], saved['body'])

    def test_slow_model_cannot_overwrite_newer_edit(self):
        self.save()
        self.upstream.enabled, self.upstream.local_mode = True, False
        def edit_during_generation(*args, **kwargs):
            with sqlite3.connect(self.path) as db:
                db.execute("UPDATE shared_diary SET body='新版本正文',revision=revision+1 WHERE date=?", (self.day,))
            return dict(reply=MEMORY)
        with patch.object(self.upstream, 'chat', side_effect=edit_during_generation):
            self.assertEqual(self.client.post(self.url + '/story', json=dict(revision=1)).status_code, 409)
        self.assertEqual(self.client.get('/api/shared-diary').json['entries'][0]['body'], '新版本正文')

    def test_playlist_only_together_actual_plays_and_deduplicates_events(self):
        event = dict(songId='sunny-window', seconds=20, sessionId='solo', eventId='solo-event')
        self.client.post('/api/play', json=event)
        self.client.post('/api/favorites', json=dict(songId='moon-letter', favorite=True))
        self.assertEqual(self.client.get('/api/together/playlist').json['songs'], [])
        event.update(context='together', sessionId='shared', eventId='shared-event')
        self.assertEqual(self.client.post('/api/play', json=event).status_code, 200)
        self.assertFalse(self.client.post('/api/play', json=event).json['recorded'])
        event['eventId'] = 'shared-event-2'
        self.client.post('/api/play', json=event)
        songs = self.client.get('/api/together/playlist').json['songs']
        self.assertEqual(len(songs), 1)
        self.assertEqual((songs[0]['seconds'], songs[0]['playCount']), (40, 1))
        event['context'] = 'solo'
        self.assertEqual(self.client.post('/api/play', json=event).status_code, 409)
        event['context'] = 'invalid'
        self.assertEqual(self.client.post('/api/play', json=event).status_code, 400)


if __name__ == '__main__':
    unittest.main()
