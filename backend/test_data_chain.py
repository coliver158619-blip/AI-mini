"""Verify real HTTP -> Flask -> SQLite -> report JSON with an isolated database."""

from contextlib import closing, contextmanager
import json
from pathlib import Path
import sqlite3
import tempfile
from threading import Thread
import unittest
from urllib.request import Request, urlopen

from werkzeug.serving import WSGIRequestHandler, make_server

from backend.app import CATALOG, create_app


class QuietHandler(WSGIRequestHandler):
    def log(self, type, message, *args):
        pass


@contextmanager
def running_api(database):
    app = create_app({"DATABASE": str(database), "SEED_DEMO": False, "TESTING": True, "PET_CHAT_MODE": "local"})
    server = make_server("127.0.0.1", 0, app, request_handler=QuietHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()

    def request(path, payload=None):
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = Request(f"http://127.0.0.1:{server.server_port}{path}", data=body, headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=5) as response:
            return json.load(response)

    try:
        yield request
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


class DataChainTest(unittest.TestCase):
    def test_http_play_changes_database_and_report_trends_after_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / "chain.sqlite3"
            with running_api(database) as request:
                before = request("/api/reports?period=month")
                self.assertEqual([point["minutes"] for point in before["trend"]], [0] * 6)
                payload = {"songId": CATALOG[0][0], "seconds": 120, "sessionId": "chain-session", "eventId": "chain-first"}
                self.assertTrue(request("/api/play", payload)["recorded"])
                self.assertFalse(request("/api/play", payload)["recorded"])
                self.assertTrue(request("/api/play", {**payload, "seconds": 60, "eventId": "chain-second"})["recorded"])

                with closing(sqlite3.connect(database)) as db:
                    saved = db.execute("SELECT count(*), sum(seconds), count(DISTINCT session_id), sum(is_demo) FROM plays").fetchone()
                self.assertEqual(saved, (2, 180, 1, 0))

                month = request("/api/reports?period=month")
                self.assertEqual(month["trend"][-1]["minutes"], 3)
                self.assertEqual(month["trend"][-1]["songCount"], 1)
                self.assertEqual([point["minutes"] for point in month["trend"][:-1]], [0] * 5)
                self.assertEqual(month["summary"]["playCount"], 1)
                self.assertEqual(sum(day["minutes"] for day in month["daily"]), 3)
                self.assertFalse(month["isDemo"])
                self.assertEqual(request("/api/reports?period=month&offset=-1")["summary"]["minutes"], 0)
                self.assertEqual(request("/api/reports?period=year")["trend"][-1]["minutes"], 3)

            # New app and HTTP server, same on-disk database: no browser state is retained.
            with running_api(database) as request:
                restarted = request("/api/reports?period=month")
                self.assertEqual(restarted["trend"], month["trend"])
                self.assertEqual(restarted["summary"], month["summary"])
                self.assertEqual(request("/api/diary")["entries"][0]["minutes"], 3)


if __name__ == "__main__":
    unittest.main()
