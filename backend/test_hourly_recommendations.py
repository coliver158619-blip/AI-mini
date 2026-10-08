"""Persistent hourly recommendation scheduling, with no live model calls."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
import os
from pathlib import Path
import sqlite3
import tempfile
from threading import Event
import unittest
from unittest.mock import patch

from backend.app import LOCAL_ZONE, claim_hourly_recommendation, create_app
from backend.kugou import RemoteError
from backend.test_kugou import FIXTURE_CONFIG
from backend.test_recommendations import SONGS


REMOTE = {"reply": "不显示的说明", "songs": SONGS, "quickCommands": []}


class HourlyRecommendationsTest(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.path = Path(directory.name)
        script = self.path / "test.py"
        script.write_text(FIXTURE_CONFIG, encoding="utf-8")
        environment = patch.dict(os.environ, {"PET_CHAT_CONFIG_PATH": str(script)}, clear=True)
        environment.start()
        self.addCleanup(environment.stop)
        self.at = datetime(2026, 10, 1, 17, 0, tzinfo=LOCAL_ZONE)
        clock = patch("backend.app.now", return_value=self.at)
        self.clock = clock.start()
        self.addCleanup(clock.stop)
        self.config = {"TESTING": True, "DATABASE": str(self.path / "hourly.sqlite3"), "SEED_DEMO": False, "PET_CHAT_MODE": "auto"}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.upstream = self.app.extensions["kugou"]
        network = patch("backend.kugou.build_opener", side_effect=AssertionError("No network in scheduler tests"))
        network.start()
        self.addCleanup(network.stop)

    def post(self, client=None):
        result = (client or self.client).post("/api/recommendations/hourly")
        self.assertEqual(result.status_code, 200)
        return result.json

    def test_first_attempt_one_hour_boundary_and_restart(self):
        initial = self.client.get("/api/recommendations/hourly").json
        self.assertEqual(initial["songs"], [])
        self.assertIsNone(initial["nextAt"])
        self.assertFalse(initial["pending"])
        with patch("backend.kugou.KugouClient.chat", return_value=REMOTE) as call:
            first = self.post()
            self.assertEqual(len(first["songs"]), 1)
            self.assertEqual(first["songs"][0]["id"], "kg-876")
            self.assertEqual(first["createdAt"], self.at.isoformat())
            self.assertEqual(first["attemptAt"], self.at.isoformat())
            self.assertEqual(first["nextAt"], (self.at + timedelta(hours=1)).isoformat())
            self.assertFalse(first["pending"])
            self.assertIsNone(first["error"])
            self.assertNotIn("reply", first)
            restarted = create_app(self.config).test_client()
            self.assertEqual(restarted.get("/api/recommendations/hourly").json["songs"], first["songs"])
            self.clock.return_value = self.at + timedelta(hours=1) - timedelta(microseconds=1)
            self.assertEqual(self.post(restarted)["attemptAt"], first["attemptAt"])
            self.assertEqual(call.call_count, 1)
            self.clock.return_value = self.at + timedelta(hours=1)
            second = self.post(restarted)
            self.assertEqual(call.call_count, 2)
            self.assertEqual(second["nextAt"], (self.at + timedelta(hours=2)).isoformat())
        self.assertEqual(self.client.get("/api/messages").json["messages"], [])
        with sqlite3.connect(self.config["DATABASE"]) as db:
            rows = db.execute("SELECT song_ids, origin FROM recommendation_requests").fetchall()
            self.assertEqual(rows, [('["kg-876"]', 'hourly'), ('["kg-876"]', 'hourly')])

    def test_manual_requests_are_unlimited_and_hourly_uses_recent_scene_and_weather(self):
        with patch("backend.weather.fetch_json", return_value={"current": {"weather_code": 61, "temperature_2m": 23}}):
            self.client.post("/api/weather", json={"city": "广州", "latitude": 23.129, "longitude": 113.264})
        with patch.object(self.upstream, "chat", return_value=REMOTE) as call:
            for _ in range(2):
                self.assertEqual(self.client.post("/api/recommendations", json={"scene": "放松", "message": "刚刚下班"}).status_code, 200)
            hourly = self.post()
            query = call.call_args.args[0]
            for value in ("放松", "广州", "23.129", "113.264", "雨天", "17:00"):
                self.assertIn(value, query)
            self.assertTrue(call.call_args.kwargs["recommend"])
            self.assertEqual(len(hourly["songs"]), 1)
            self.assertEqual(len(self.client.get("/api/recommendations?scene=放松").json["songs"]), 2)
            self.client.post("/api/recommendations", json={"scene": "开心"})
            self.post()
            self.assertEqual(call.call_count, 4)

    def test_previous_hourly_scene_does_not_keep_expired_manual_mood_alive(self):
        with patch.object(self.upstream, "chat", return_value=REMOTE) as call:
            self.client.post("/api/recommendations", json={"scene": "开心"})
            self.assertEqual(self.post()["context"]["scene"], "开心")
            self.clock.return_value = self.at + timedelta(hours=25)
            self.assertEqual(self.post()["context"]["scene"], "")
            self.assertIn("用户选择的心情或场景：未指定", call.call_args.args[0])

    def test_failed_attempt_is_persisted_and_keeps_last_success_without_fake_songs(self):
        with patch.object(self.upstream, "chat", side_effect=RemoteError("chat", "network")) as call:
            failure = self.post()
            self.assertTrue(failure["error"])
            self.assertEqual(failure["songs"], [])
            self.post()
            self.assertEqual(call.call_count, 1)
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get("/api/recommendations/hourly").json["error"], failure["error"])
        self.clock.return_value = self.at + timedelta(hours=1)
        with patch.object(self.upstream, "chat", return_value=REMOTE):
            success = self.post()
        self.clock.return_value = self.at + timedelta(hours=2)
        with patch.object(self.upstream, "chat", side_effect=RemoteError("chat", "network")):
            failed_again = self.post()
        self.assertEqual(failed_again["songs"], success["songs"])
        self.assertEqual(failed_again["createdAt"], success["createdAt"])
        self.assertEqual(failed_again["nextAt"], (self.at + timedelta(hours=3)).isoformat())
        self.assertEqual(self.client.get("/api/messages").json["messages"], [])

    def test_disabled_and_unconfigured_do_not_call_model_and_still_back_off(self):
        local_app = create_app({**self.config, "PET_CHAT_MODE": "local"})
        with patch("backend.kugou.KugouClient.chat", return_value=REMOTE) as call:
            result = self.post(local_app.test_client())
            self.assertTrue(result["error"])
            self.assertEqual(result["songs"], [])
            self.assertEqual(result["nextAt"], (self.at + timedelta(hours=1)).isoformat())
            self.post()
            call.assert_not_called()
            self.clock.return_value = self.at + timedelta(hours=1)
            self.upstream.enabled = False
            result = self.post()
            self.assertTrue(result["error"])
            call.assert_not_called()

    def test_parallel_workers_only_one_claim_is_allowed(self):
        entered, release = Event(), Event()
        second_app = create_app(self.config)

        def blocked_model(*args, **kwargs):
            entered.set()
            if not release.wait(5):
                raise AssertionError("Test did not release the model request")
            return REMOTE

        with patch("backend.kugou.KugouClient.chat", side_effect=blocked_model) as call, ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(lambda: self.app.test_client().post("/api/recommendations/hourly"))
            try:
                self.assertTrue(entered.wait(3))
                status = second_app.test_client().get("/api/recommendations/hourly").json
                self.assertTrue(status["pending"])
                duplicate = self.post(second_app.test_client())
                self.assertTrue(duplicate["pending"])
                self.assertEqual(call.call_count, 1)
            finally:
                release.set()
            completed = first.result(timeout=5)
        self.assertEqual(completed.status_code, 200)
        self.assertFalse(completed.json["pending"])
        self.assertEqual(len(completed.json["songs"]), 1)

    def test_interrupted_attempt_recovers_only_at_next_hour(self):
        with self.app.app_context():
            self.assertTrue(claim_hourly_recommendation())
        restarted = create_app(self.config).test_client()
        with patch("backend.kugou.KugouClient.chat", return_value=REMOTE) as call:
            self.assertTrue(self.post(restarted)["pending"])
            call.assert_not_called()
            self.clock.return_value = self.at + timedelta(hours=1)
            self.assertFalse(restarted.get("/api/recommendations/hourly").json["pending"])
            result = self.post(restarted)
            self.assertEqual(len(result["songs"]), 1)
            call.assert_called_once()

    def test_existing_recommendation_table_migrates_without_losing_history(self):
        path = str(self.path / "previous-version.sqlite3")
        with sqlite3.connect(path) as db:
            db.execute("CREATE TABLE recommendation_requests(id INTEGER PRIMARY KEY AUTOINCREMENT, scene TEXT NOT NULL, message TEXT NOT NULL, song_ids TEXT NOT NULL, context TEXT NOT NULL, created_at TEXT NOT NULL)")
            db.execute("INSERT INTO recommendation_requests(scene, message, song_ids, context, created_at) VALUES ('放松', '历史推荐', '[]', '{}', ?)", (self.at.isoformat(),))
        migrated = create_app({**self.config, "DATABASE": path}).test_client()
        self.assertIsNone(migrated.get("/api/recommendations/hourly").json["attemptAt"])
        self.assertEqual(migrated.get("/api/recommendations?scene=放松").json["createdAt"], self.at.isoformat())
        with sqlite3.connect(path) as db:
            self.assertEqual(db.execute("SELECT message, origin FROM recommendation_requests").fetchall(), [("历史推荐", "manual")])


if __name__ == "__main__":
    unittest.main()
