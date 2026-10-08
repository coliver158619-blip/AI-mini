"""Daily memory contracts with isolated databases and a stubbed model."""
from datetime import timedelta
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, get_db, get_profile, now
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

    def test_context_generation_and_persistence_without_extra_calls(self):
        self.seed_day()
        self.assertTrue(self.entry()['story']['stale'])
        self.model.assert_not_called()  # Listing all dates never calls the model.
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, 200)
        query = self.model.call_args.args[0]
        with self.app.app_context():
            context = context_for_day(get_db(), now().date(), get_profile()['name'])
        self.assertEqual(len(context['listenedSongs']), 2)
        self.assertEqual(context['listenedSongs'][0]['plays'], 1)
        self.assertEqual(context['listenedSongs'][0]['seconds'], 120)
        self.assertEqual(context['userWords'], ['项目终于完成了'])
        self.assertEqual(context['personalNote'], '想记住这份开心')
        self.assertEqual(context['recommendedOnly'][0]['songs'][0]['title'], '安静的森林')
        self.assertEqual(context['weatherRecords'][0]['conditions'], ['雷雨'])
        for value in ('窗边的晴天', '月亮来信', '听1次、2.0分钟', '项目终于完成了', '想记住这份开心', '雷雨'):
            self.assertIn(value, query)
        self.assertNotIn('昨天的秘密', query)
        self.assertFalse(self.model.call_args.kwargs['recommend'])
        self.assertEqual(response.json['entry']['body'], MEMORY)
        self.assertFalse(response.json['entry']['story']['stale'])
        self.client.post(self.url)
        self.assertEqual(self.model.call_count, 1)
        restarted = create_app(self.config).test_client()
        saved = next(e for e in restarted.get('/api/diary').json['entries'] if e['date'] == self.day)
        self.assertEqual(saved['body'], MEMORY)
        self.assertEqual(saved['note'], '想记住这份开心')

    def test_new_note_invalidates_and_failure_keeps_previous_memory(self):
        self.seed_day()
        self.client.post(self.url)
        entry = self.client.put(f'/api/diary/{self.day}', json={'note': '现在有一点想念朋友'}).json['entry']
        self.assertTrue(entry['story']['stale'])
        self.assertEqual(entry['body'], MEMORY)
        self.model.side_effect = RemoteError('chat', 'timeout')
        self.assertEqual(self.client.post(self.url).status_code, 503)
        self.assertEqual(self.entry()['body'], MEMORY)
        self.model.side_effect = None
        self.model.return_value = {'reply': MEMORY + '这份想念，也可以放在我们的歌里。'}
        self.assertEqual(self.client.post(self.url).status_code, 200)
        self.assertFalse(self.entry()['story']['stale'])
        self.assertIn('现在有一点想念朋友', self.model.call_args.args[0])

    def test_empty_day_and_recommendation_are_not_listening(self):
        self.assertFalse(self.entry()['story']['canGenerate'])
        self.client.post(self.url)
        self.model.assert_not_called()
        self.client.put(f'/api/diary/{self.day}', json={'note': '今天生日，想听开心的歌'})
        self.model.return_value = {'reply': '今天的生日心情，被你认真写进这一页。虽然我们还没有一起播放歌曲，我也想把祝福轻轻交给你。愿这一天可以按你喜欢的节奏展开，等你挑好旋律，我们再一起为这份快乐留一个小小的位置。'}
        self.client.post(self.url)
        with self.app.app_context():
            context = context_for_day(get_db(), now().date(), get_profile()['name'])
        self.assertEqual(context['listenedSongs'], [])
        self.assertEqual(self.entry()['songCount'], 0)

    def test_concurrent_lease_and_expired_lease(self):
        self.seed_day()
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO diary_stories(date,pending_until) VALUES (?,?)", (self.day, (now() + timedelta(minutes=1)).isoformat()))
        self.assertEqual(self.client.post(self.url).status_code, 409)
        self.model.assert_not_called()
        with sqlite3.connect(self.path) as db:
            db.execute("UPDATE diary_stories SET pending_until=?", ((now() - timedelta(minutes=1)).isoformat(),))
        self.assertEqual(self.client.post(self.url).status_code, 200)

    def test_invalid_output_is_not_saved_and_dates_validated(self):
        self.seed_day()
        self.model.return_value = {'reply': '```json\n{"text": "internal"}\n```'}
        self.assertEqual(self.client.post(self.url).status_code, 503)
        self.assertEqual(self.entry()['story']['text'], '')
        for day in ('bad', '2026-02-30', '1999-01-01', (now().date() + timedelta(days=1)).isoformat()):
            self.assertEqual(self.client.post(f'/api/diary/{day}/story').status_code, 400)

    def test_additional_play_invalidates_cache(self):
        self.seed_day()
        self.client.post(self.url)
        self.client.post('/api/play', json={'songId': 'moon-letter', 'seconds': 30, 'sessionId': 'new-play', 'eventId': 'new-event'})
        self.assertTrue(self.entry()['story']['stale'])
        self.client.post(self.url)
        self.assertEqual(self.model.call_count, 2)

    def test_off_topic_song_or_invented_event_is_retried_and_not_saved(self):
        self.seed_day()
        for bad in ('今天你生日，' + MEMORY, MEMORY + '再听一首《不在记录里的歌》。', MEMORY + '你想听吗？'):
            self.model.return_value = {'reply': bad}
            before = self.model.call_count
            self.assertEqual(self.client.post(self.url).status_code, 503)
            self.assertEqual(self.model.call_count - before, 2)
            self.assertEqual(self.entry()['story']['text'], '')
        self.model.side_effect = [{'reply': '```code```'}, {'reply': MEMORY}]
        self.assertEqual(self.client.post(self.url).json['entry']['body'], MEMORY)


