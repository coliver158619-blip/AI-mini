"""Opt-in live card generation check using only a temporary database."""

import json
from pathlib import Path
import tempfile

from .app import create_app


def run():
    with tempfile.TemporaryDirectory(prefix="music-cards-live-") as directory:
        config = {"DATABASE": str(Path(directory) / "probe.sqlite3"), "SEED_DEMO": False, "PET_CHAT_MODE": "auto"}
        app = create_app(config)
        client = app.test_client()
        # Guangzhou is an explicit test location, never inferred as the user's location.
        weather = client.post("/api/weather", json={"city": "广州", "latitude": 23.1, "longitude": 113.2})
        print(json.dumps({"check": "weather", "status": weather.status_code, "source": weather.json.get("source"), "condition": weather.json.get("condition"), "error": weather.json.get("error")}, ensure_ascii=False), flush=True)
        for scene in ("放松", "开心"):
            response = client.post("/api/recommendations", json={"scene": scene, "message": "请结合已分享的天气和位置选歌"})
            if response.status_code != 200:
                print(json.dumps({"check": "recommendations", "scene": scene, "status": response.status_code, "error": response.json.get("error")}, ensure_ascii=False), flush=True)
                raise RuntimeError("Real card generation did not succeed")
            data = response.json
            assert data["source"] == "kugou" and data["songs"]
            assert "reply" not in data and "quickCommands" not in data
            saved = create_app(config).test_client().get("/api/recommendations", query_string={"scene": scene}).json
            assert saved["songs"] == data["songs"]
            assert client.get("/api/messages").json["messages"] == []
            print(json.dumps({"check": "recommendations", "scene": scene, "source": data["source"], "songCount": len(data["songs"]), "titles": [song["title"] for song in data["songs"]], "weatherIncluded": bool(data["context"]["weather"]), "savedAfterRestart": True, "chatMessageCount": 0}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    run()
