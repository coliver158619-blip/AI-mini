"""Isolated model-only recommendation contracts, never use live credentials."""

from datetime import timedelta
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from backend.app import create_app, now
from backend.kugou import RemoteError
from backend.test_kugou import FIXTURE_CONFIG, sse


SONGS = [
    {"mixsongid": "876", "ori_song_name": "夜风", "singer_name": "歌手甲"},
    {"mixsongid": "123", "ori_song_name": "雨后", "singer_name": "歌手乙"},
]
CARDS = sse(
    {"tag": "[THINK]", "content": "internal"},
    {"tag": "[JSON]", "content": {"msgtype": 9012, "song_list": SONGS}},
    {"tag": "[END]", "content": ""},
)


class RecommendationsTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name)
        script = self.path / "test.py"
        script.write_text(FIXTURE_CONFIG, encoding="utf-8")
        environment = patch.dict(os.environ, {"PET_CHAT_CONFIG_PATH": str(script)}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        self.config = {"TESTING": True, "DATABASE": str(self.path / "test.sqlite3"), "SEED_DEMO": False, "PET_CHAT_MODE": "auto"}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.upstream = self.app.extensions["kugou"]
        network = patch("backend.kugou.build_opener", side_effect=AssertionError("Unexpected external request"))
        network.start()
        self.addCleanup(network.stop)

    def record_weather(self, at=None):
        with patch("backend.weather.fetch_json", return_value={"current": {"weather_code": 95, "temperature_2m": 23.2}}), patch("backend.app.now", return_value=at or now()):
            response = self.client.post("/api/weather", json={"city": "广州", "latitude": 23.1, "longitude": 113.2})
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("songs", response.json)
        return response.json

    def test_scene_location_weather_enter_model_and_only_cards_are_saved(self):
        weather = self.record_weather()
        with patch.object(self.upstream, "post", return_value=CARDS) as post:
            response = self.client.post("/api/recommendations", json={"scene": "放松", "message": "下班路上听一点"})
        self.assertEqual(response.status_code, 200)
        body = post.call_args.args[2]
        self.assertEqual(body["query_command_extend"], {"intention": "recommend"})
        for value in ("放松", "下班路上听一点", "广州", "雷雨", "23.1", "113.2", "23.2", weather["updatedAt"]):
            self.assertIn(value, body["query"])
        data = response.json
        self.assertEqual(data["source"], "kugou")
        self.assertEqual(data["integration"]["state"], "connected")
        self.assertEqual([song["id"] for song in data["songs"]], ["kg-876", "kg-123"])
        self.assertNotIn("reply", data)
        self.assertNotIn("quickCommands", data)
        self.assertEqual(data["context"], {"scene": "放松", "weather": weather})
        self.assertEqual(self.client.get("/api/messages").json["messages"], [])
        self.assertTrue(all("audioUrl" not in song for song in data["songs"]))
        self.client.post("/api/favorites", json={"songId": "kg-876", "favorite": True})
        restarted = create_app(self.config).test_client()
        saved = restarted.get("/api/recommendations?scene=放松").json
        self.assertEqual(saved["createdAt"], data["createdAt"])
        self.assertEqual(saved["context"], data["context"])
        self.assertTrue(saved["songs"][0]["favorite"])
        self.assertEqual(restarted.get("/api/recommendations?scene=专注").json["songs"], [])
        with sqlite3.connect(self.config["DATABASE"]) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM recommendation_requests").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0)

    def test_unknown_location_not_invented_and_model_copy_is_not_returned(self):
        raw = sse({"tag": "[TEXT]", "content": "这是不需要显示的说明"}) + b"\n" + CARDS
        with patch.object(self.upstream, "post", return_value=raw) as post:
            response = self.client.post("/api/recommendations", json={})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json["context"]["weather"])
        self.assertIn('"weather": null', post.call_args.args[2]["query"])
        self.assertNotIn("这是不需要显示", response.get_data(as_text=True))

    def test_latest_mood_and_personal_results_are_separate_and_survive_failure(self):
        with patch.object(self.upstream, "post", return_value=CARDS):
            self.client.post('/api/recommendations', json={'scene': '放松一下'})
            mood = self.client.post('/api/recommendations', json={'scene': '有点难过'}).json
            personal = self.client.post('/api/recommendations', json={}).json
        with patch.object(self.upstream, 'chat', side_effect=RemoteError('chat', 'network')):
            self.assertEqual(self.client.post('/api/recommendations', json={}).status_code, 503)
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get('/api/recommendations?mode=mood').json['context'], mood['context'])
        self.assertEqual(restarted.get('/api/recommendations?mode=personal').json['createdAt'], personal['createdAt'])

    def test_expired_weather_refreshes_same_saved_coordinates(self):
        original = self.record_weather(now() - timedelta(hours=2))
        with patch("backend.weather.fetch_json", return_value={"current": {"weather_code": 0, "temperature_2m": 27}}) as fetch, patch.object(self.upstream, "post", return_value=CARDS) as post:
            response = self.client.post("/api/recommendations", json={"scene": "开心"})
        self.assertEqual(response.status_code, 200)
        params = fetch.call_args.args[1]
        self.assertEqual((params["latitude"], params["longitude"]), (23.1, 113.2))
        weather = response.json["context"]["weather"]
        self.assertEqual(weather["condition"], "晴天")
        self.assertFalse(weather["cached"])
        self.assertNotEqual(weather["updatedAt"], original["updatedAt"])
        self.assertIn("晴天", post.call_args.args[2]["query"])
        self.assertEqual(self.client.get("/api/bootstrap").json["weather"], weather)

    def test_weather_refresh_failure_is_labeled_as_history(self):
        original = self.record_weather(now() - timedelta(hours=2))
        with patch("backend.weather.fetch_json", side_effect=OSError("offline")), patch.object(self.upstream, "post", return_value=CARDS) as post:
            response = self.client.post("/api/recommendations", json={"scene": "专注"})
        self.assertEqual(response.status_code, 200)
        weather = response.json["context"]["weather"]
        self.assertTrue(weather["cached"])
        self.assertEqual(weather["updatedAt"], original["updatedAt"])
        self.assertIn('"cached": true', post.call_args.args[2]["query"])

    def test_failure_and_missing_cards_never_fall_back_to_demo(self):
        for result, status in (
            (RemoteError("chat", "network"), 503),
            ({"reply": "稍后试试", "songs": [], "quickCommands": []}, 502),
            ({"reply": "稍后试试", "songs": [{"mixsongid": "123"}], "quickCommands": []}, 502),
        ):
            with self.subTest(result=type(result).__name__):
                kwargs = {"side_effect": result} if isinstance(result, Exception) else {"return_value": result}
                with patch.object(self.upstream, "chat", **kwargs):
                    response = self.client.post("/api/recommendations", json={})
                self.assertEqual(response.status_code, status)
                self.assertNotIn("songs", response.json)
                self.assertNotIn("reply", response.json)
        self.assertEqual(self.client.get("/api/recommendations").json["songs"], [])
        self.assertEqual(self.client.get("/api/messages").json["messages"], [])

    def test_local_mode_and_missing_config_reject_generation(self):
        local_app = create_app({**self.config, "PET_CHAT_MODE": "local"})
        with patch.object(local_app.extensions["kugou"], "chat") as chat:
            response = local_app.test_client().post("/api/recommendations", json={"scene": "开心"})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("songs", response.json)
        chat.assert_not_called()
        self.upstream.enabled = False
        with patch.object(self.upstream, "chat") as chat:
            response = self.client.post("/api/recommendations", json={})
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("songs", response.json)
        chat.assert_not_called()

    def test_card_only_sse_is_valid_only_for_recommendations(self):
        with patch.object(self.upstream, "post", return_value=CARDS):
            result = self.upstream.chat("推荐", recommend=True)
            self.assertEqual(result["songs"], SONGS)
            with self.assertRaises(RemoteError):
                self.upstream.chat("你好", recommend=False)
        errored = sse({"tag": "[ERROR]", "code": 401}) + b"\n" + CARDS
        with patch.object(self.upstream, "post", return_value=errored):
            with self.assertRaises(RemoteError):
                self.upstream.chat("推荐", recommend=True)

    def test_validation(self):
        for body in ([], {"scene": ["开心"]}, {"scene": "x" * 41}, {"message": "x" * 1001}):
            self.assertEqual(self.client.post("/api/recommendations", json=body).status_code, 400)
        self.assertEqual(self.client.get("/api/recommendations?scene=" + "x" * 41).status_code, 400)


if __name__ == "__main__":
    unittest.main()
