"""Daily memory contracts with isolated databases and a stubbed model."""
from datetime import timedelta
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, get_db, get_profile, now, publish_daily_diary
from backend.diary_story import context_for_day
from backend.kugou import RemoteError


MEMORY = "你把《窗边的晴天》留在耳边，又听了一次《月亮来信》。从想放慢脚步，到告诉我项目终于完成，今天的旋律也有了不同的分量。\n\n我想陪你把这份轻松好好收起来：辛苦的那一段没有白走，这一页就留给终于可以舒一口气的我们。"


class DiaryStoryTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = str(Path(directory.name) / "diary.sqlite3")
        self.config = {"TESTING": True, "DATABASE": self.path, "SEED_DEMO": False, "PET_CHAT_MODE": "local"}
        self.app = create_app(self.config)
        self.upstream = self.app.extensions["kugou"]
        self.upstream.enabled, self.upstream.local_mode = True, False
        self.client = self.app.test_client()
        self.day = now().date().isoformat()
        self.url = f"/api/diary/{self.day}/story"
        self.model = patch.object(self.upstream, "chat", return_value={"reply": MEMORY}).start()
        self.addCleanup(patch.stopall)

    def seed_day(self):
        at = now().isoformat()
        with sqlite3.connect(self.path) as db:
            db.executemany("INSERT INTO plays(song_id,seconds,listened_at,mood,session_id) VALUES (?,?,?,?,?)", [
                ("sunny-window", 60, at, "放松", "same-play"),
                ("sunny-window", 60, at, "放松", "same-play"),
                ("moon-letter", 90, at, "开心", "another-play")])
            db.execute("INSERT INTO messages(role,content,created_at) VALUES ('user',?,?)", ("项目终于完成了", at))
            db.execute("INSERT INTO messages(role,content,created_at) VALUES ('user','昨天的秘密',?)", ((now() - timedelta(days=1)).isoformat(),))
            db.execute("INSERT INTO diary_notes VALUES (?,?)", (self.day, "想记住这份开心"))
            db.execute("INSERT INTO recommendation_requests(scene,message,song_ids,context,created_at) VALUES ('专注','给我一首歌',?,'{}',?)", (json.dumps(["quiet-forest"]), at))
            db.execute("INSERT INTO weather_snapshots(date,latitude,longitude,data,created_at) VALUES (?,23,113,?,?)", (self.day, json.dumps({"city": "广州", "condition": "雷雨", "temperature": 24, "severe": True, "updatedAt": at}), at))

    def entry(self):
        return next(e for e in self.client.get('/api/diary').json['entries'] if e['date'] == self.day)

    def publish(self, at):
        with patch('backend.app.now', return_value=at), self.app.app_context():
            return publish_daily_diary()

    def test_only_twenty_two_oclock_publishes_once_and_restart_preserves_it(self):
        self.seed_day()
        at = now().replace(hour=22, minute=0, second=0, microsecond=0)
        original = self.entry()
        self.assertFalse(self.publish(at - timedelta(minutes=1)))
        self.client.post(self.url)
        self.model.assert_not_called()
        self.assertTrue(self.publish(at))
        self.assertEqual(self.entry()['body'], MEMORY)
        self.assertFalse(self.publish(at + timedelta(seconds=20)))
        self.assertFalse(self.publish(at + timedelta(hours=1)))
        self.assertEqual(self.model.call_count, 1)
        self.assertNotEqual(original['body'], MEMORY)
        restarted = create_app(self.config).test_client()
        saved = next(e for e in restarted.get('/api/diary').json['entries'] if e['date'] == self.day)
        self.assertEqual(saved['body'], MEMORY)
        self.assertFalse(saved['story']['canGenerate'])

    def test_context_still_uses_playlist_weather_and_emotion(self):
        self.seed_day()
        self.publish(now().replace(hour=22, minute=0))
        query = self.model.call_args.args[0]
        for value in ('窗边的晴天', '月亮来信', '听1次、2.0分钟', '项目终于完成了', '想记住这份开心', '雷雨'):
            self.assertIn(value, query)
        self.assertNotIn('昨天的秘密', query)

    def test_notes_plays_and_weather_do_not_rewrite_published_content(self):
        self.seed_day()
        self.publish(now().replace(hour=22, minute=0))
        before = self.entry()
        self.client.put(f'/api/diary/{self.day}', json={'note': '想念朋友'})
        self.client.post('/api/play', json={'songId': 'moon-letter', 'seconds': 30, 'sessionId': 'new', 'eventId': 'new'})
        self.client.post(self.url)
        after = self.entry()
        self.assertEqual(after['body'], before['body'])
        self.assertEqual(after['minutes'], before['minutes'])
        self.assertEqual(after['note'], '想念朋友')
        self.assertEqual(self.model.call_count, 1)
        with patch('backend.app.now', return_value=now() + timedelta(days=1)):
            saved = self.entry()
            self.assertTrue(saved['locked'])
            self.assertEqual(saved['note'], '想念朋友')
            self.assertEqual(self.client.put(f'/api/diary/{self.day}', json={'note': '改写'}).status_code, 409)
            self.client.post(self.url)
        self.assertEqual(self.model.call_count, 1)

    def test_failure_keeps_old_edition_and_does_not_retry_outside_schedule(self):
        self.seed_day()
        before = self.entry()['body']
        self.model.side_effect = RemoteError('chat', 'timeout')
        at = now().replace(hour=22, minute=0)
        self.assertTrue(self.publish(at))
        self.assertFalse(self.publish(at + timedelta(seconds=20)))
        self.client.post(self.url)
        self.assertEqual(self.entry()['body'], before)
        self.assertEqual(self.model.call_count, 1)

    def test_historical_and_empty_entries_never_call_model_on_open(self):
        self.client.post(self.url)
        yesterday = (now() - timedelta(days=1)).date().isoformat()
        self.client.post(f'/api/diary/{yesterday}/story')
        self.publish(now().replace(hour=22, minute=0))
        self.model.assert_not_called()
        with patch('backend.app.now', return_value=now() + timedelta(days=1)):
            self.assertTrue(self.entry()['locked'])

    def test_invalid_output_keeps_saved_edition(self):
        self.seed_day()
        before = self.entry()['body']
        self.model.return_value = {'reply': MEMORY + '再听一首《不在记录里的歌》。'}
        self.publish(now().replace(hour=22, minute=0))
        self.assertEqual(self.model.call_count, 2)
        self.assertEqual(self.entry()['body'], before)
        for day in ('bad', '2026-02-30', '1999-01-01', (now().date() + timedelta(days=1)).isoformat()):
            self.assertEqual(self.client.post(f'/api/diary/{day}/story').status_code, 400)
