"""Run with python -m unittest backend.test_app -v."""

from datetime import timedelta
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import CATALOG, create_app, now, period_bounds
from backend.kugou import RemoteError, parse_sse, sign
from backend.weather import get_weather
from backend.chat_text import clean_assistant_text


class AppTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "companion.sqlite3")
        self.config = {"TESTING": True, "DATABASE": self.path, "SEED_DEMO": False, "PET_CHAT_MODE": "local"}
        self.app = create_app(self.config)
        self.app.extensions["kugou"].enabled = False
        self.client = self.app.test_client()
        self.song = CATALOG[0][0]

    def tearDown(self):
        self.temp.cleanup()

    def test_bootstrap_health_and_audio(self):
        self.assertEqual(self.client.get("/api/health").json["status"], "ok")
        data = self.client.get("/api/bootstrap").json
        self.assertFalse(data["isDemo"])
        self.assertIsNone(data["weather"])
        self.assertEqual(len(data["songs"]), 8)
        wav = self.client.get(data["songs"][0]["audioUrl"])
        self.assertEqual(wav.status_code, 200)
        self.assertTrue(wav.data.startswith(b"RIFF"))
        self.assertIn("audio/wav", wav.content_type)
        partial = self.client.get(data["songs"][0]["audioUrl"], headers={"Range": "bytes=0-99"})
        self.assertEqual(partial.status_code, 206)
        self.assertEqual(len(partial.data), 100)

    def test_chat_validation_and_persistence(self):
        for value in ({}, {"message": " "}, {"message": "a" * 1001}, {"message": []}):
            self.assertEqual(self.client.post("/api/chat", json=value).status_code, 400)
        response = self.client.post("/api/chat", json={"message": "工作有点累", "scene": "relax"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["source"], "local")
        self.assertEqual(len(response.json["songs"]), 3)
        client = create_app(self.config).test_client()
        messages = client.get("/api/messages").json["messages"]
        self.assertEqual([message["role"] for message in messages], ["user", "assistant"])
        self.assertEqual(messages[0]["content"], "工作有点累")

    def test_saved_assistant_markup_is_cleaned_without_changing_user_text(self):
        raw = '### 放松音乐\n- FKJ 的 [ **《Ylang Ylang》** ]({"type":1,"mixsongid":"704282887"})：柔钢琴。'
        with sqlite3.connect(self.path) as db:
            db.executemany("INSERT INTO messages(role,content,created_at,source) VALUES (?,?,?,?)", [(role, raw, now().isoformat(), "kugou") for role in ("user", "assistant")])
        messages = self.client.get('/api/messages').json['messages']
        self.assertEqual(messages[0]['content'], raw)
        self.assertNotIn('mixsongid', messages[1]['content'])
        self.assertNotIn('###', messages[1]['content'])
        self.assertIn('《Ylang Ylang》', messages[1]['content'])
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("SELECT content FROM messages WHERE role='assistant'").fetchone()[0], raw)

    def test_lan_address_and_loopback_only_status(self):
        with patch('backend.network.socket.socket') as sock, patch.dict('os.environ', {'HOST': '0.0.0.0', 'PORT': '5000'}):
            sock.return_value.__enter__.return_value.getsockname.return_value = ('10.23.4.5', 40000)
            response = self.client.get('/api/network').json
            self.assertTrue(response['enabled'])
            self.assertEqual(response['urls'], ['http://10.23.4.5:5000'])
            with patch.dict('os.environ', {'HOST': '127.0.0.1'}):
                self.assertEqual(self.client.get('/api/network').json['urls'], [])

    def test_explicit_scene_takes_precedence_over_message(self):
        response = self.client.post("/api/chat", json={"message": "有点累，想放松一下", "scene": "放松一下"})
        self.assertEqual(response.json["mood"], "放松")
        self.assertTrue(all("放松" in song["tags"] for song in response.json["songs"]))

    def test_profile_favorites_and_note_survive_restart(self):
        self.assertEqual(self.client.post("/api/profile", json={"name": "小太阳"}).status_code, 200)
        self.client.post("/api/favorites", json={"songId": self.song, "favorite": True})
        today = now().date().isoformat()
        response = self.client.put("/api/diary/" + today, json={"note": "今天工作完成了，很开心。"})
        self.assertEqual(response.json["entry"]["note"], "今天工作完成了，很开心。")
        client = create_app(self.config).test_client()
        self.assertEqual(client.get("/api/bootstrap").json["profile"]["name"], "小太阳")
        self.assertTrue(client.get("/api/bootstrap").json["songs"][0]["favorite"])
        self.assertEqual(client.get("/api/diary").json["entries"][0]["note"], "今天工作完成了，很开心。")

    def test_real_play_aggregation_and_session_count(self):
        for index in range(4):
            response = self.client.post("/api/play", json={"songId": self.song, "seconds": 15, "sessionId": "one-session", "eventId": f"chunk-{index}"})
            self.assertTrue(response.json["recorded"])
        # A network retry has no effect on either duration or energy.
        retry = self.client.post("/api/play", json={"songId": self.song, "seconds": 15, "sessionId": "one-session", "eventId": "chunk-0"})
        self.assertFalse(retry.json["recorded"])
        report = self.client.get("/api/reports?period=week").json
        self.assertEqual(report["summary"]["minutes"], 1)
        self.assertEqual(report["summary"]["songCount"], 1)
        self.assertEqual(report["summary"]["playCount"], 1)
        self.assertEqual(report["summary"]["activeDays"], 1)
        self.assertEqual(report["topSongs"][0]["plays"], 1)
        self.assertFalse(report["isDemo"])
        self.assertEqual(self.client.get("/api/diary").json["entries"][0]["minutes"], 1)
        self.assertEqual(create_app(self.config).test_client().get("/api/reports?period=year").json["summary"]["minutes"], 1)

    def test_play_validation_and_session_conflict(self):
        for seconds in (0, -1, 3601, True, "30", None, 1.5):
            self.assertEqual(self.client.post("/api/play", json={"songId": self.song, "seconds": seconds}).status_code, 400)
        self.assertEqual(self.client.post("/api/play", json={"songId": "missing", "seconds": 10}).status_code, 404)
        payload = {"songId": self.song, "seconds": 30, "eventId": "same", "sessionId": "same"}
        self.client.post("/api/play", json=payload)
        self.assertEqual(self.client.post("/api/play", json={**payload, "seconds": 20}).status_code, 409)
        self.assertEqual(self.client.post("/api/play", json={**payload, "songId": CATALOG[1][0]}).status_code, 409)

    def test_report_boundaries_and_history(self):
        today = now().date()
        week_start, _ = period_bounds("week")
        with sqlite3.connect(self.path) as db:
            db.execute("INSERT INTO plays(song_id,seconds,listened_at,mood) VALUES (?,120,?,'治愈')", (self.song, week_start.isoformat() + "T00:00:00+08:00"))
            db.execute("INSERT INTO plays(song_id,seconds,listened_at,mood) VALUES (?,60,?,'治愈')", (self.song, (week_start - timedelta(days=1)).isoformat() + "T23:59:59+08:00"))
        current = self.client.get("/api/reports?period=week").json
        previous = self.client.get("/api/reports?period=week&offset=-1").json
        self.assertEqual(current["summary"]["minutes"], 2)
        self.assertEqual(previous["summary"]["minutes"], 1)
        self.assertEqual(current["comparison"]["minutesPercent"], 100)
        for period, expected in (("week", 7), ("month", 6), ("year", 5)):
            self.assertEqual(len(self.client.get(f"/api/reports?period={period}").json["trend"]), expected)

    def test_bad_requests_return_json(self):
        cases = ["/api/reports?period=bad", "/api/reports?offset=1", "/api/reports?offset=-61", "/api/reports?offset=x"]
        for url in cases:
            self.assertEqual(self.client.get(url).status_code, 400)
        for day in ("2026-02-30", "bad-date", "9999-01-01"):
            self.assertEqual(self.client.put("/api/diary/" + day, json={"note": "a"}).status_code, 400)
        self.assertEqual(self.client.post("/api/chat", json=[]).status_code, 400)
        self.assertEqual(self.client.post("/api/chat", data="bad json", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.get("/api/not-real").status_code, 404)
        self.assertTrue(self.client.get("/api/not-real").is_json)
        self.assertEqual(self.client.post("/api/chat", json={"message": "a" * 40000}).status_code, 413)

    def test_feed_reward_once_per_day(self):
        first = self.client.post("/api/feed").json
        second = self.client.post("/api/feed").json
        self.assertEqual(first["profile"]["energy"], 40)
        self.assertEqual(second["profile"]["energy"], 40)
        self.assertTrue(second["profile"]["fedToday"])

    def test_demo_seed_is_explicit_and_only_once(self):
        other = str(Path(self.temp.name) / "demo.sqlite3")
        config = {**self.config, "DATABASE": other, "SEED_DEMO": True}
        demo = create_app(config).test_client()
        first = demo.get("/api/reports?period=year").json
        again = create_app(config).test_client().get("/api/reports?period=year").json
        self.assertTrue(first["isDemo"])
        self.assertGreater(first["summary"]["minutes"], 0)
        self.assertEqual(first["summary"], again["summary"])
        self.assertTrue(demo.get("/api/diary").json["entries"][0]["isDemo"])

    @patch("backend.weather.fetch_json")
    def test_weather_search_snapshot_diary_and_restart(self, fetch):
        fetch.return_value = {"results": [{"id": 1, "name": "广州", "latitude": 23.1, "longitude": 113.2, "country": "中国"}]}
        found = self.client.get("/api/location/search?q=广州").json
        self.assertEqual(found["results"][0]["city"], "广州")
        fetch.return_value = {"current": {"weather_code": 95, "temperature_2m": 23.2, "precipitation": 2.1, "wind_speed_10m": 14, "time": "2026-09-22T12:00"}}
        response = self.client.post("/api/weather", json={"latitude": 23.1, "longitude": 113.2, "city": "广州"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["condition"], "雷雨")
        self.assertTrue(response.json["severe"])
        self.assertNotIn("songs", response.json)
        diary = self.client.get("/api/diary").json["entries"][0]
        self.assertEqual(diary["weather"]["city"], "广州")
        self.assertIn("雷雨", diary["body"])
        self.assertIn("安心", diary["body"])
        bootstrap = create_app(self.config).test_client().get("/api/bootstrap").json
        self.assertEqual(bootstrap["weather"]["code"], 95)
        reply = self.client.post("/api/chat", json={"message": "下雨了推荐音乐"}).json["reply"]
        self.assertIn("广州", reply)

    @patch("backend.weather.fetch_json")
    def test_old_weather_is_labeled_and_weather_only_day_is_in_diary(self, fetch):
        fetch.return_value = {"current": {"weather_code": 0, "temperature_2m": 25}}
        yesterday = now() - timedelta(days=1)
        with patch("backend.app.now", return_value=yesterday):
            self.client.post("/api/weather", json={"latitude": 23.1, "longitude": 113.2, "city": "广州"})
        bootstrap = self.client.get("/api/bootstrap").json
        self.assertTrue(bootstrap["weather"]["cached"])
        self.assertIn("上次记录", bootstrap["greeting"])
        chat = self.client.post("/api/chat", json={"message": "根据天气推荐音乐"}).json
        self.assertIn("上次记录", chat["reply"])
        self.assertNotEqual(chat["mood"], "开心")
        dates = [entry["date"] for entry in self.client.get("/api/diary").json["entries"]]
        self.assertIn(yesterday.date().isoformat(), dates)

    @patch("backend.weather.fetch_json")
    def test_diary_weather_conditions_stay_with_their_city(self, fetch):
        fetch.return_value = {"current": {"weather_code": 0, "temperature_2m": 25}}
        self.client.post("/api/weather", json={"latitude": 23.1, "longitude": 113.2, "city": "广州"})
        fetch.return_value = {"current": {"weather_code": 95, "temperature_2m": 19}}
        self.client.post("/api/weather", json={"latitude": 39.9, "longitude": 116.4, "city": "北京"})
        body = self.client.get("/api/diary").json["entries"][0]["body"]
        self.assertIn("广州：晴天", body)
        self.assertIn("北京：雷雨", body)
        self.assertNotIn("北京：晴天", body)

    @patch("backend.weather.fetch_json", side_effect=OSError("No network"))
    def test_weather_failures_are_not_fabricated(self, fetch):
        self.assertEqual(self.client.get("/api/location/search?q=广州").status_code, 503)
        response = self.client.post("/api/weather", json={"latitude": 23.1, "longitude": 113.2, "city": "广州"})
        self.assertEqual(response.status_code, 503)
        self.assertIsNone(self.client.get("/api/bootstrap").json["weather"])
        for invalid in ({"latitude": 100, "longitude": 10}, {"latitude": True, "longitude": 10}, {"latitude": 1, "longitude": "foo"}):
            self.assertEqual(self.client.post("/api/weather", json=invalid).status_code, 400)

    @patch("backend.weather.fetch_json")
    def test_weather_cache_is_marked_on_failure(self, fetch):
        fetch.return_value = {"current": {"weather_code": 0, "temperature_2m": 25}}
        payload = {"latitude": 23.1, "longitude": 113.2, "city": "广州"}
        self.client.post("/api/weather", json=payload)
        fetch.side_effect = OSError("Offline")
        result = self.client.post("/api/weather", json=payload)
        self.assertEqual(result.status_code, 200)
        self.assertTrue(result.json["cached"])
        self.assertIn("上次", result.json["notice"])

    def test_upstream_failure_has_no_fake_reply_and_success_imports_songs(self):
        upstream = self.app.extensions["kugou"]
        upstream.enabled = True
        upstream.local_mode = False
        with patch.object(upstream, "chat", side_effect=RemoteError("chat", "network")):
            response = self.client.post("/api/chat", json={"message": "想听点开心的"})
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json["source"], "kugou-error")
            self.assertEqual(response.json["integration"]["state"], "error")
            self.assertNotIn("reply", response.json)
            self.assertEqual(self.client.get("/api/messages").json["messages"], [])
        remote = {"reply": "为你找到这首歌。", "songs": [{"mixsongid": "123", "ori_song_name": "真实歌曲", "singer_name": "歌手"}], "quickCommands": []}
        with patch.object(upstream, "chat", return_value=remote):
            response = self.client.post("/api/chat", json={"message": "推荐一首歌"})
            self.assertEqual(response.json["source"], "kugou")
            self.assertEqual(response.json["songs"][0]["id"], "kg-123")
            self.assertNotIn("audioUrl", response.json["songs"][0])
        reordered = {**remote, "songs": [{"mixsongid": "456", "ori_song_name": "另一首歌", "singer_name": "另一位歌手"}, *remote["songs"]]}
        with patch.object(upstream, "chat", return_value=reordered):
            response = self.client.post("/api/chat", json={"message": "再推荐两首"})
            self.assertEqual([song["id"] for song in response.json["songs"]], ["kg-456", "kg-123"])

    def test_remote_context_and_session_survive_restart_with_weather(self):
        remote = {"reply": "记住啦，小雨。", "songs": [], "quickCommands": ["聊聊今天"]}
        upstream = self.app.extensions["kugou"]
        upstream.enabled = True
        upstream.local_mode = False
        with patch.object(upstream, "chat", return_value=remote) as call:
            self.client.post("/api/chat", json={"message": "我叫小雨"})
            first = call.call_args.kwargs
            self.assertEqual(first["history"], [])
            self.assertFalse(first["recommend"])
        app = create_app(self.config)
        app.extensions["kugou"].enabled = True
        app.extensions["kugou"].local_mode = False
        client = app.test_client()
        with patch("backend.weather.fetch_json", return_value={"current": {"weather_code": 95, "temperature_2m": 23}}):
            client.post("/api/weather", json={"latitude": 23.1, "longitude": 113.2, "city": "广州"})
        with patch.object(app.extensions["kugou"], "chat", return_value=remote) as call:
            response = client.post("/api/chat", json={"message": "你还记得我叫什么吗？"})
            self.assertEqual(response.json["source"], "kugou")
            self.assertEqual(call.call_args.kwargs["session_id"], first["session_id"])
            self.assertEqual(call.call_args.kwargs["history"][0]["content"], "我叫小雨")
            self.assertIn("广州", call.call_args.args[0])
            self.assertIn("雷雨", call.call_args.args[0])
            self.assertEqual(len(client.get("/api/messages").json["messages"]), 4)


class AdapterTest(unittest.TestCase):
    def test_assistant_song_metadata_and_code_are_not_copy(self):
        text = "### 爵士\n- [《Way Out》]({'type':1,'mixsongid':'39673718'})：舒缓。\n```json\n{\"debug\":true}\n```\n适合 20 分钟放松。"
        self.assertEqual(clean_assistant_text(text), '爵士\n• 《Way Out》：舒缓。\n\n适合 20 分钟放松。')
        self.assertEqual(clean_assistant_text('喜欢《晴天》（现场版），可以吗？'), '喜欢《晴天》（现场版），可以吗？')

    def test_sse_only_exposes_final_text_and_song_metadata(self):
        events = [{"tag": "[THINK]", "content": "Internal reasoning"}, {"tag": "[TEXT]", "content": "你好"}, {"tag": "[TEXT]", "content": "呀"}, {"tag": "[JSON]", "content": json.dumps({"msgtype": 9012, "song_list": [{"mixsongid": "123"}]})}, {"tag": "[END]", "content": ""}]
        result = parse_sse("\n".join("data: " + json.dumps(event) for event in events).encode())
        self.assertEqual(result["reply"], "你好呀")
        self.assertEqual(result["songs"][0]["mixsongid"], "123")
        self.assertNotIn("Internal", result["reply"])

    def test_signature_is_deterministic_and_does_not_mutate_params(self):
        params = {"b": "2", "a": "1", "r": "3"}
        first = sign(params, {"query": "你好"}, "test-key_NOR")
        second = sign({"a": "1", "b": "2"}, {"query": "你好"}, "test-key")
        self.assertEqual(first, second)
        self.assertEqual(params["r"], "3")


if __name__ == "__main__":
    unittest.main()
