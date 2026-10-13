"""Explicit diary materials, media boundaries, immutability and Beijing scheduling."""
from contextlib import closing
from datetime import datetime, timedelta, timezone
from io import BytesIO
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import LOCAL_ZONE, create_app, run_scheduled_diary
from backend.kugou import RemoteError


STORY = "今天，你把一点安静的心情留在这一页。我想陪你慢慢收好这些细小的片刻，不必着急把每一天都过得热闹。\n\n有音乐的时候，我们就一起听；还没有旋律的时候，也可以留一小段空白。愿这一页成为我们回头时，可以轻轻停靠的地方。"


class DiaryInputsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = str(Path(self.temp.name) / "inputs.sqlite3")
        self.at = datetime(2026, 10, 13, 10, 0, tzinfo=LOCAL_ZONE)
        self.clock = patch("backend.app.now", side_effect=lambda: self.at).start()
        self.addCleanup(patch.stopall)
        self.config = {"TESTING": True, "DATABASE": self.path, "SEED_DEMO": False, "PET_CHAT_MODE": "local"}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.model = self.app.extensions["kugou"]
        self.model.enabled, self.model.local_mode = True, False
        self.chat = patch.object(self.model, "chat", return_value={"reply": STORY}).start()
        self.day = self.at.date().isoformat()
        self.url = f"/api/diary/{self.day}/inputs"

    def entry(self):
        return next(item for item in self.client.get('/api/diary').json['entries'] if item['date'] == self.day)

    def upload(self, kind="photo", raw=b"\x89PNG\r\n\x1a\nfixture", filename="photo.png"):
        return self.client.post(f"/api/diary/{self.day}/attachments", data={"kind": kind, "file": (BytesIO(raw), filename)})

    def schedule(self, at=None):
        with self.app.app_context():
            return run_scheduled_diary(at)

    def test_all_inputs_persist_and_enter_grounded_model_prompt(self):
        photo = self.upload().json['attachment']
        camera = self.upload('camera', b'\xff\xd8\xffphoto', 'camera.jpg').json['attachment']
        voice = self.upload('voice', b'\x1aE\xdf\xa3voice', 'voice.webm').json['attachment']
        payload = {'note': '完成了项目，开心', 'songId': 'sunny-window',
                   'location': {'text': '广州珠江边', 'latitude': 23.1, 'longitude': 113.3},
                   'voiceTranscript': '想记住今天的轻松',
                   'attachments': [{'id': photo['id'], 'caption': '今天拍下的落日'},
                                   {'id': camera['id'], 'caption': '和朋友分享的蛋糕'}, {'id': voice['id']}]}
        result = self.client.post(self.url, json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['entry']['story']['source'], 'input')
        self.assertEqual(result.json['entry']['body'], STORY)
        self.assertTrue(result.json['entry']['canEdit'])
        self.assertEqual(result.json['entry']['inputs']['song']['title'], '窗边的晴天')
        query = self.chat.call_args.args[0]
        for item in ('完成了项目', '窗边的晴天', '广州珠江边', '想记住今天的轻松', '今天拍下的落日', '和朋友分享的蛋糕', '附件本身未被图像或音频识别'):
            self.assertIn(item, query)
        self.assertNotIn('photo.png', query)
        downloaded = self.client.get(photo['url'])
        self.assertTrue(downloaded.data.startswith(b'\x89PNG'))
        self.assertEqual(downloaded.content_type, 'image/png')
        self.assertEqual(downloaded.headers['X-Content-Type-Options'], 'nosniff')
        restarted = create_app(self.config).test_client().get('/api/diary').json['entries'][0]
        self.assertEqual(restarted['inputs']['attachments'][0]['caption'], '今天拍下的落日')
        self.assertEqual(restarted['body'], STORY)
        self.client.post(self.url, json=payload)
        self.assertEqual(self.chat.call_count, 1)

    def test_scheduler_only_beijing_22_once_and_never_overwrites_explicit_story(self):
        self.client.post(self.url, json={'note': '今天很平静'})
        for hour, minute in ((10, 0), (21, 59), (22, 1), (23, 0)):
            self.at = self.at.replace(hour=hour, minute=minute)
            self.assertFalse(self.schedule())
        self.at = self.at.replace(hour=22, minute=0)
        self.assertTrue(self.schedule(self.at.astimezone(timezone.utc)))
        self.assertFalse(self.schedule())
        self.assertEqual(self.chat.call_count, 1)
        self.assertEqual(self.entry()['story']['source'], 'input')
        self.assertEqual(self.entry()['body'], STORY)

    def test_no_input_uses_actual_daily_context_at_22_without_opening_diary(self):
        self.client.post('/api/play', json={'songId': 'moon-letter', 'seconds': 120, 'sessionId': 'actual'})
        self.client.get('/api/diary')
        self.client.post(f'/api/diary/{self.day}/story')
        self.chat.assert_not_called()
        self.at = self.at.replace(hour=22)
        self.assertTrue(self.schedule())
        self.assertIn('《月亮来信》', self.chat.call_args.args[0])
        self.assertIn('听1次、2.0分钟', self.chat.call_args.args[0])
        self.assertEqual(self.entry()['story']['source'], 'scheduled')
        self.client.post('/api/play', json={'songId': 'sunny-window', 'seconds': 120})
        self.client.get('/api/diary')
        self.client.post(f'/api/diary/{self.day}/story')
        self.assertFalse(self.schedule())
        self.assertEqual(self.chat.call_count, 1)

    def test_model_failure_preserves_new_inputs_and_old_edition_then_retry(self):
        self.client.post(self.url, json={'note': '先记录平静的一天'})
        self.chat.side_effect = RemoteError('chat', 'timeout')
        failure = self.client.post(self.url, json={'note': '现在想念朋友'})
        self.assertEqual(failure.status_code, 503)
        self.assertEqual(failure.json['entry']['inputs']['note'], '现在想念朋友')
        self.assertEqual(failure.json['entry']['story']['text'], STORY)
        self.chat.side_effect = None
        self.chat.return_value = {'reply': STORY + '这份想念也留在今天。'}
        retried = self.client.post(self.url, json={'note': '现在想念朋友'})
        self.assertEqual(retried.status_code, 200)
        self.assertTrue(retried.json['entry']['body'].endswith('这份想念也留在今天。'))

    def test_previous_dates_locked_and_late_model_response_cannot_write_yesterday(self):
        self.client.post(self.url, json={'note': '想记住今天'})
        old = self.entry()['body']
        self.at += timedelta(days=1)
        self.assertEqual(self.client.post(self.url, json={'note': '改写过去'}).status_code, 409)
        self.assertEqual(self.client.put(f'/api/diary/{self.day}', json={'note': '改写过去'}).status_code, 409)
        self.assertEqual(self.upload().status_code, 409)
        self.assertEqual(self.client.post(f'/api/diary/{self.day}/story').status_code, 409)
        self.assertEqual(self.entry()['body'], old)
        self.assertFalse(self.entry()['canEdit'])
        self.assertTrue(self.entry()['isLocked'])
        new_day = self.at.date().isoformat()
        def delayed_reply(*args, **kwargs):
            self.at += timedelta(days=1)
            return {'reply': STORY}
        self.chat.side_effect = delayed_reply
        self.assertEqual(self.client.post(f'/api/diary/{new_day}/inputs', json={'note': '等待回应'}).status_code, 409)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT text FROM diary_stories WHERE date=?', (new_day,)).fetchone()[0], '')

    def test_validates_materials_before_changing_saved_inputs(self):
        self.client.post(self.url, json={'note': '保留的原文'})
        for payload in ({'note': '字' * 301}, {'note': []}, {'songId': 'missing'},
                        {'voiceTranscript': '字' * 2001}, {'location': {'text': '广州', 'latitude': 91, 'longitude': 113}},
                        {'location': {'text': '广州', 'latitude': 23}}, {'attachments': [{'id': 'missing'}]}, {'attachments': 'bad'}):
            self.assertEqual(self.client.post(self.url, json=payload).status_code, 400)
        self.assertEqual(self.entry()['inputs']['note'], '保留的原文')
        self.assertEqual(self.upload(raw=b'<svg onload="alert(1)">', filename='fake.png').status_code, 400)
        self.assertEqual(self.upload(raw=b'\x89PNG\r\n\x1a\n' + b'x' * (8 * 1024 * 1024)).status_code, 400)
        self.assertEqual(self.client.post('/api/chat', json={'message': 'x' * 40000}).status_code, 413)

    def test_photo_and_voice_without_description_are_not_invented_as_recognized(self):
        photo = self.upload().json['attachment']
        self.client.post(self.url, json={'attachments': [{'id': photo['id']}]})
        query = self.chat.call_args.args[0]
        self.assertIn('用户保存了一份照片素材', query)
        self.assertIn('不能编造画面、人物或录音内容', query)

    def test_model_unavailable_still_persists_materials(self):
        self.model.enabled = False
        result = self.client.post(self.url, json={'note': '稍后再来写成日记'})
        self.assertEqual(result.status_code, 503)
        self.assertEqual(result.json['entry']['inputs']['note'], '稍后再来写成日记')
        self.chat.assert_not_called()


if __name__ == '__main__':
    unittest.main()
