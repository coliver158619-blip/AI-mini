"""Opt-in live smoke check. Uses a temporary DB and never prints credentials.

Run: python -m backend.probe_live
"""
import json
from pathlib import Path
import tempfile

from .app import create_app


def run():
    with tempfile.TemporaryDirectory(prefix="music-live-") as directory:
        config = {"DATABASE": str(Path(directory) / "probe.sqlite3"), "SEED_DEMO": False, "PET_CHAT_MODE": "auto"}
        app = create_app(config)
        client = app.test_client()

        def request(method, path, body=None):
            response = client.open(path, method=method, json=body)
            if response.status_code != 200:
                raise RuntimeError(response.json.get("error", "接口未成功"))
            return response.json

        locations = request("GET", "/api/location/search?q=广州")["results"]
        location = next(item for item in locations if item["country"] in ("中国", "China"))
        weather = request("POST", "/api/weather", {key: location[key] for key in ("latitude", "longitude", "city")})
        print(json.dumps({"check": "public-weather", "source": weather["source"], "city": weather["city"], "condition": weather["condition"], "cached": weather["cached"]}, ensure_ascii=False), flush=True)

        first = request("POST", "/api/chat", {"message": "请叫我小满。今天下班有些疲惫，想和你聊聊天。"})
        assert first["source"] == "kugou" and first["reply"]
        # Re-create the Flask app to ensure context is read from SQLite.
        client = create_app(config).test_client()
        second = request("POST", "/api/chat", {"message": "你还记得我希望你怎么称呼我吗？"})
        assert second["source"] == "kugou" and "小满" in second["reply"]
        history = request("GET", "/api/messages")["messages"]
        assert len(history) == 4
        print(json.dumps({"check": "multi-turn-after-restart", "source": second["source"], "reply": second["reply"], "savedMessages": len(history)}, ensure_ascii=False), flush=True)

        recommended = request("POST", "/api/chat", {"message": "根据我分享的当地天气推荐几首适合放松的歌。"})
        assert recommended["source"] == "kugou" and recommended["songs"]
        assert request("GET", "/api/diary")["entries"][0]["weather"]["city"] == weather["city"]
        print(json.dumps({"check": "weather-recommendations", "source": recommended["source"], "songCount": len(recommended["songs"]), "firstSong": recommended["songs"][0]["title"], "weatherSavedInDiary": True}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
