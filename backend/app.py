"""Single-user H5 music companion with durable SQLite storage.

Run from the project root: python -m backend.app
"""

from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from io import BytesIO
import json
import math
import os
from pathlib import Path
import random
import re
import sqlite3
import uuid

from flask import Flask, current_app, g, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException

from .audio import generate_preview
from .chat_text import clean_assistant_text
from .diary_story import context_for_day, generate_story, story_state
from .network import lan_access
from .kugou import KugouClient, RemoteError
from .weather import get_weather, search_locations


ROOT = Path(__file__).resolve().parent.parent
LOCAL_ZONE = timezone(timedelta(hours=8))
MOOD_COLORS = {"治愈": "#E8B878", "开心": "#F4CE73", "专注": "#87AFA4", "放松": "#B6A6CD", "运动": "#E49A81", "睡眠": "#8A99BD", "通勤": "#8EB8CB"}
CATALOG = [
    ("sunny-window", "窗边的晴天", "#E8BD6E", ["治愈", "开心", "清晨"], 0),
    ("orange-coast", "橘子海岸", "#E8A883", ["放松", "通勤", "黄昏"], 1),
    ("quiet-forest", "安静的森林", "#94B7A5", ["专注", "放松", "学习"], 2),
    ("moon-letter", "月亮来信", "#A2A3C7", ["睡眠", "治愈", "夜晚"], 3),
    ("little-adventure", "小小的冒险", "#E2C56D", ["开心", "运动", "活力"], 4),
    ("rain-on-glass", "雨落在窗台", "#91AFBE", ["专注", "治愈", "雨天"], 5),
    ("slow-sunday", "慢慢的星期天", "#C3AD96", ["放松", "治愈", "周末"], 6),
    ("morning-train", "开往晨光的列车", "#D7A4AA", ["通勤", "开心", "清晨"], 7),
]


def now():
    return datetime.now(LOCAL_ZONE)


def get_db():
    if "db" not in g:
        from flask import current_app
        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA busy_timeout = 10000")
    return g.db


def init_db(app):
    target = Path(app.config["DATABASE"])
    target.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(target, timeout=10) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL,
                joined_date TEXT NOT NULL, energy INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS songs (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, artist TEXT NOT NULL,
                color TEXT NOT NULL, tags TEXT NOT NULL, audio_seed INTEGER
            );
            CREATE TABLE IF NOT EXISTS plays (
                id INTEGER PRIMARY KEY AUTOINCREMENT, song_id TEXT NOT NULL REFERENCES songs(id),
                seconds INTEGER NOT NULL CHECK(seconds > 0 AND seconds <= 3600),
                listened_at TEXT NOT NULL, mood TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
                event_id TEXT UNIQUE, session_id TEXT
            );
            CREATE INDEX IF NOT EXISTS plays_date ON plays(listened_at);
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL,
                content TEXT NOT NULL, songs TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'local'
            );
            CREATE TABLE IF NOT EXISTS favorites (
                song_id TEXT PRIMARY KEY REFERENCES songs(id), created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diary_notes (date TEXT PRIMARY KEY, note TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS diary_stories (
                date TEXT PRIMARY KEY, text TEXT NOT NULL DEFAULT '', context_hash TEXT,
                updated_at TEXT, attempt_id TEXT, pending_until TEXT
            );
            CREATE TABLE IF NOT EXISTS feed_events (date TEXT PRIMARY KEY, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS weather_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL,
                latitude REAL NOT NULL, longitude REAL NOT NULL,
                data TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS weather_date ON weather_snapshots(date);
            CREATE TABLE IF NOT EXISTS recommendation_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT, scene TEXT NOT NULL,
                message TEXT NOT NULL, song_ids TEXT NOT NULL,
                context TEXT NOT NULL, created_at TEXT NOT NULL,
                origin TEXT NOT NULL DEFAULT 'manual'
            );
            CREATE TABLE IF NOT EXISTS hourly_recommendation (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                attempt_at TEXT, next_at TEXT, attempt_id TEXT,
                pending INTEGER NOT NULL DEFAULT 0,
                request_id INTEGER REFERENCES recommendation_requests(id),
                error TEXT
            );
        """)
        if "session_id" not in {column[1] for column in db.execute("PRAGMA table_info(plays)")}:
            db.execute("ALTER TABLE plays ADD COLUMN session_id TEXT")
        if "origin" not in {column[1] for column in db.execute("PRAGMA table_info(recommendation_requests)")}:
            db.execute("ALTER TABLE recommendation_requests ADD COLUMN origin TEXT NOT NULL DEFAULT 'manual'")
        if "conversation_id" not in {column[1] for column in db.execute("PRAGMA table_info(messages)")}:
            db.execute("ALTER TABLE messages ADD COLUMN conversation_id TEXT REFERENCES conversations(id)")
        db.execute("CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, id)")
        db.execute("INSERT OR IGNORE INTO hourly_recommendation(id) VALUES (1)")
        for id_, title, color, tags, seed in CATALOG:
            db.execute("INSERT OR IGNORE INTO songs VALUES (?, ?, ?, ?, ?, ?)", (id_, title, "陪伴音乐室", color, json.dumps(tags, ensure_ascii=False), seed))
        db.execute("INSERT OR IGNORE INTO app_meta VALUES ('chat_session_id', ?)", (str(uuid.uuid4()),))
        legacy = db.execute("SELECT value FROM app_meta WHERE key='chat_session_id'").fetchone()[0]
        db.execute("INSERT OR IGNORE INTO app_meta VALUES ('legacy_chat_session_id', ?)", (legacy,))
        legacy = db.execute("SELECT value FROM app_meta WHERE key='legacy_chat_session_id'").fetchone()[0]
        first, last = db.execute("SELECT MIN(created_at), MAX(created_at) FROM messages").fetchone()
        db.execute("INSERT OR IGNORE INTO conversations VALUES (?, ?, ?, ?)", (legacy, "历史对话" if first else "新对话", first or now().isoformat(), last or now().isoformat()))
        db.execute("UPDATE messages SET conversation_id=? WHERE conversation_id IS NULL", (legacy,))
        if db.execute("SELECT 1 FROM app_meta WHERE key = 'initialized'").fetchone():
            return
        today = now().date()
        seeded = app.config["SEED_DEMO"]
        db.execute("INSERT OR IGNORE INTO profile VALUES (1, ?, ?, ?)", ("乌萨奇", (today - timedelta(days=127) if seeded else today).isoformat(), 1080 if seeded else 0))
        if seeded:
            rng = random.Random(20260922)
            for age in range(127, -1, -1):
                # Demo history is explicit, deterministic and seeded exactly once.
                if age > 6 and age % 7 == 4:
                    continue
                day = today - timedelta(days=age)
                for index in range(rng.randint(5, 13)):
                    song = CATALOG[rng.choices(range(len(CATALOG)), weights=[9, 7, 6, 5, 4, 3, 4, 3])[0]]
                    at = datetime.combine(day, time(8 + index % 13, rng.randrange(60)), LOCAL_ZONE)
                    db.execute("INSERT INTO plays(song_id, seconds, listened_at, mood, is_demo) VALUES (?, ?, ?, ?, 1)", (song[0], rng.randint(150, 300), at.isoformat(), song[3][0]))
            db.executemany("INSERT INTO favorites VALUES (?, ?)", [(song[0], now().isoformat()) for song in CATALOG[:3]])
        db.execute("INSERT INTO app_meta VALUES ('initialized', ?)", (now().isoformat(),))
        db.execute("INSERT INTO app_meta VALUES ('demo_seeded', ?)", ("true" if seeded else "false",))


def song_dict(row):
    result = {"id": row["id"], "title": row["title"], "artist": row["artist"], "color": row["color"], "tags": json.loads(row["tags"]), "favorite": bool(row["favorite"])}
    if row["audio_seed"] is not None:
        result.update(audioUrl=f"/api/audio/{row['id']}.wav", audioLabel="原创演示音乐", duration=32)
    return result


def conversation_id(value=None):
    id_ = value if value is not None else get_db().execute("SELECT value FROM app_meta WHERE key='chat_session_id'").fetchone()[0]
    if not isinstance(id_, str) or not get_db().execute("SELECT 1 FROM conversations WHERE id=?", (id_,)).fetchone():
        raise ValueError("这段对话不存在，请重新选择历史对话")
    return id_


def conversation_messages(id_):
    rows = get_db().execute("""SELECT * FROM messages WHERE COALESCE(conversation_id,
        (SELECT value FROM app_meta WHERE key='legacy_chat_session_id'))=? ORDER BY id""", (id_,)).fetchall()
    return [{"id": row["id"], "role": row["role"], "content": clean_assistant_text(row["content"]) if row["role"] == "assistant" else row["content"], "songs": json.loads(row["songs"]), "createdAt": row["created_at"], "source": row["source"]} for row in rows]


def all_songs():
    rows = get_db().execute("SELECT s.*, EXISTS(SELECT 1 FROM favorites f WHERE f.song_id = s.id) AS favorite FROM songs s ORDER BY s.rowid").fetchall()
    return [song_dict(row) for row in rows]


def import_remote_songs(songs, mood):
    """Persist real catalog metadata, preserving the model's song order."""
    ids = []
    with get_db() as db:
        for song in songs[:12]:
            if not isinstance(song, dict) or not song.get("mixsongid"):
                continue
            title = song.get("ori_song_name") or song.get("songname")
            if not isinstance(title, str) or not title.strip():
                continue
            id_ = "kg-" + str(song["mixsongid"])
            artist = song.get("singer_name") or "未知歌手"
            db.execute("INSERT INTO songs VALUES (?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO UPDATE SET title=excluded.title, artist=excluded.artist, tags=excluded.tags", (id_, title.strip()[:200], str(artist)[:200], "#E8BD6E", json.dumps([mood], ensure_ascii=False)))
            if id_ not in ids:
                ids.append(id_)
    catalog = {song["id"]: song for song in all_songs()}
    return [catalog[id_] for id_ in ids]


def get_profile():
    db, today = get_db(), now().date()
    row = db.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    dates = {r[0] for r in db.execute("SELECT DISTINCT substr(listened_at, 1, 10) FROM plays")}
    current = today if today.isoformat() in dates else today - timedelta(days=1)
    streak = 0
    while current.isoformat() in dates:
        streak += 1
        current -= timedelta(days=1)
    return {"name": row["name"], "days": max(1, (today - date.fromisoformat(row["joined_date"])).days + 1), "energy": row["energy"], "energyMax": 1600, "streak": streak, "fedToday": bool(db.execute("SELECT 1 FROM feed_events WHERE date = ?", (today.isoformat(),)).fetchone())}


def infer_mood(text):
    terms = (
        ("睡眠", ("睡", "晚安", "夜深", "失眠", "sleep")),
        ("治愈", ("难过", "伤心", "累", "焦虑", "emo", "sad", "低落", "治愈", "压力")),
        ("专注", ("学习", "工作", "专注", "写", "focus", "study")),
        ("运动", ("运动", "跑步", "健身", "workout", "run")),
        ("通勤", ("通勤", "地铁", "上班", "commute")),
        ("开心", ("开心", "快乐", "高兴", "happy", "活力")),
        ("放松", ("放松", "休息", "relax", "chill", "散步")),
    )
    lowered = text.lower()
    return next((mood for mood, keywords in terms if any(k in lowered for k in keywords)), "治愈")


def recommend(message, scene="", weather=None):
    mood = infer_mood(scene if scene else message)
    weather = weather or latest_weather()
    weather_related = not scene and any(word in message for word in ("天气", "下雨", "打雷", "台风", "你好", "早上好", "嗨", "推荐"))
    if weather and not weather.get("cached") and weather_related and not any(word in message.lower() for word in ("难过", "伤心", "累", "焦虑", "emo", "sad", "低落", "治愈", "压力", "专注", "工作", "睡", "运动", "通勤", "开心", "放松")):
        mood = "治愈" if weather.get("severe") or "雨" in weather["condition"] or "雪" in weather["condition"] else "开心" if weather["condition"] == "晴天" else "放松"
    catalog = all_songs()
    songs = sorted(catalog, key=lambda s: (s["title"] not in message, mood not in s["tags"]))
    if any(word in message for word in ("换", "再来", "另一")):
        shift = (get_db().execute("SELECT count(*) FROM messages WHERE role = 'user'").fetchone()[0] + 1) % len(songs)
        songs = songs[shift:] + songs[:shift]
    songs = songs[:3]
    responses = {
        "睡眠": "把今天轻轻放下吧。给你挑了几段柔和的旋律，调低音量，让月光陪我们慢慢安静下来。",
        "治愈": "我在呢，不用急着让自己开心起来。先让一首温柔的歌陪着你吧，想说的话我也会听。",
        "专注": "好，我把旋律调得轻一点。这几首没有歌词的音乐，陪你进入自己的小世界，一次专心做好一件事。",
        "运动": "准备好一起动起来了吗？让明亮的节拍陪你出发，按照自己的节奏就好！",
        "通勤": "路上的时间也可以属于自己。这几首轻快的旋律，陪你走过今天的城市风景。",
        "开心": "你的好心情我也接收到啦！来，把这份快乐放进歌里，我们一起听。",
        "放松": "现在是留给自己的时间。肩膀放松一点，让这几段旋律陪你发一会儿呆吧。",
    }
    if any(word in message for word in ("你好", "早上好", "嗨", "在吗")) and not scene:
        reply = f"嗨，我是{get_profile()['name']}，一直在这里等你。今天想听一点温柔的，还是有活力的音乐？先给你准备了三首小样。"
    else:
        reply = responses[mood]
    if weather and weather_related:
        reply = weather["greeting"] + " " + reply
    return {"reply": reply, "songs": songs, "source": "local", "mood": mood, "quickCommands": ["换一组推荐", "想听放松的", "看看今天的日记"]}


def latest_weather(day=None):
    if day:
        row = get_db().execute("SELECT data FROM weather_snapshots WHERE date = ? ORDER BY id DESC LIMIT 1", (day.isoformat(),)).fetchone()
    else:
        row = get_db().execute("SELECT data FROM weather_snapshots ORDER BY id DESC LIMIT 1").fetchone()
    if not row:
        return None
    weather = json.loads(row[0])
    weather["cached"] = (now() - datetime.fromisoformat(weather["updatedAt"])).total_seconds() > 3600
    if weather["cached"]:
        mark_cached_weather(weather)
    return weather


def mark_cached_weather(weather):
    at = datetime.fromisoformat(weather["updatedAt"])
    weather.update(cached=True, greeting=f"上次记录（{at.month}月{at.day}日 {at:%H:%M}）{weather['city']}是{weather['condition']}。天气可能已经变化，刷新后我再为你挑歌；现在也可以告诉我你的心情。", notice="显示上次获取的天气，可刷新获取最新情况。")
    return weather


def store_weather(weather):
    weather["updatedAt"] = now().isoformat()
    with get_db() as db:
        db.execute("INSERT INTO weather_snapshots(date, latitude, longitude, data, created_at) VALUES (?, ?, ?, ?, ?)", (now().date().isoformat(), weather["latitude"], weather["longitude"], json.dumps(weather, ensure_ascii=False), weather["updatedAt"]))
    return weather


def recommendation_weather():
    weather = latest_weather()
    if weather and weather.get("cached"):
        try:
            weather = store_weather(get_weather(weather["latitude"], weather["longitude"], weather["city"]))
        except (OSError, ValueError, KeyError, TypeError):
            # Keep the user's actual last observation, never invent current weather.
            pass
    if not weather:
        return None
    return weather


def recommendation_payload(upstream, row=None):
    catalog = {song["id"]: song for song in all_songs()} if row else {}
    return {"songs": [catalog[id_] for id_ in json.loads(row["song_ids"]) if id_ in catalog] if row else [],
            "source": "kugou", "integration": upstream.integration(),
            "context": json.loads(row["context"]) if row else None, "createdAt": row["created_at"] if row else None}


def generate_recommendation(upstream, scene, message, origin="manual"):
    context = {"scene": scene, "weather": recommendation_weather()}
    count = "1" if origin == "hourly" else "3 到 6"
    query = (
        f"请综合用户的心情、选址和天气，为用户推荐 {count} 首真实歌曲，返回歌曲推荐卡片。"
        "只生成歌曲卡片，不需要问候、解释、聊天内容或追问。不要推荐虚构歌曲。\n"
        f"用户当前意图：{message or '为我推荐适合现在听的歌曲'}\n"
        f"用户选择的心情或场景：{scene or '未指定'}\n"
        "以下 JSON 是用户已分享的实际选址及天气数据；cached=true 代表历史天气而不是当前天气，"
        "weather=null 代表用户未分享位置天气，不能猜测城市、坐标或天气。\n"
        + json.dumps(context, ensure_ascii=False)
    )
    # Card generation is independent from the conversational session/history.
    remote = upstream.chat(query, session_id=str(uuid.uuid4()), recommend=True)
    songs = import_remote_songs(remote["songs"], infer_mood(scene or message))
    if not songs:
        raise RemoteError("recommendation", "no_songs")
    if origin == "hourly":
        songs = songs[:1]
    at = now().isoformat()
    with get_db() as db:
        row_id = db.execute("INSERT INTO recommendation_requests(scene, message, song_ids, context, created_at, origin) VALUES (?, ?, ?, ?, ?, ?)", (scene, message, json.dumps([song["id"] for song in songs]), json.dumps(context, ensure_ascii=False), at, origin)).lastrowid
    return row_id, {"songs": songs, "source": "kugou", "integration": upstream.integration(), "context": context, "createdAt": at}


def claim_hourly_recommendation():
    """Commit the retry boundary before I/O, serializing tabs and Flask workers."""
    at = now()
    with get_db() as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT next_at FROM hourly_recommendation WHERE id = 1").fetchone()
        if row["next_at"] and datetime.fromisoformat(row["next_at"]) > at:
            return None
        attempt_id = str(uuid.uuid4())
        db.execute("UPDATE hourly_recommendation SET attempt_at = ?, next_at = ?, attempt_id = ?, pending = 1, error = NULL WHERE id = 1", (at.isoformat(), (at + timedelta(hours=1)).isoformat(), attempt_id))
    return attempt_id


def hourly_recommendation_payload(upstream):
    row = get_db().execute("SELECT * FROM hourly_recommendation WHERE id = 1").fetchone()
    recommended = get_db().execute("SELECT * FROM recommendation_requests WHERE id = ?", (row["request_id"],)).fetchone() if row["request_id"] else None
    payload = recommendation_payload(upstream, recommended)
    # An interrupted process must not leave the UI pending after the retry boundary.
    pending = bool(row["pending"] and row["next_at"] and datetime.fromisoformat(row["next_at"]) > now())
    return {**payload, "attemptAt": row["attempt_at"], "nextAt": row["next_at"], "pending": pending, "error": row["error"]}


def play_identity(row):
    return row["session_id"] or f"event-{row['id']}"


def period_bounds(period, offset=0, anchor=None):
    anchor = anchor or now().date()
    if period == "week":
        start = anchor - timedelta(days=anchor.weekday()) + timedelta(weeks=offset)
        return start, start + timedelta(days=6)
    if period == "month":
        absolute = anchor.year * 12 + anchor.month - 1 + offset
        year, month = divmod(absolute, 12)
        start = date(year, month + 1, 1)
        next_year, next_month = divmod(absolute + 1, 12)
        return start, date(next_year, next_month + 1, 1) - timedelta(days=1)
    start = date(anchor.year + offset, 1, 1)
    return start, date(start.year, 12, 31)


def plays_between(start, end):
    return get_db().execute("SELECT * FROM plays WHERE listened_at >= ? AND listened_at < ? ORDER BY listened_at", (start.isoformat(), (end + timedelta(days=1)).isoformat())).fetchall()


def minutes(seconds):
    return round(seconds / 60)


def diary_entry(day):
    rows = plays_between(day, day)
    songs = {s["id"]: s for s in all_songs()}
    counts = Counter(song for song, _ in {(r["song_id"], play_identity(r)) for r in rows})
    moods = Counter(r["mood"] for r in rows)
    length = minutes(sum(r["seconds"] for r in rows))
    mood = moods.most_common(1)[0][0] if moods else "等待记录"
    top = songs[counts.most_common(1)[0][0]] if counts else None
    note = get_db().execute("SELECT note FROM diary_notes WHERE date = ?", (day.isoformat(),)).fetchone()
    if top:
        title = {"治愈": "被旋律轻轻接住的一天", "开心": "把快乐藏进耳机里", "专注": "在自己的节奏里发光", "放松": "今天，慢一点也没关系", "运动": "每一步都有自己的节拍", "睡眠": "月光也在听我们的歌", "通勤": "沿途的风景都有了配乐"}.get(mood, "今天的音乐记忆")
        body = f"今天，我们一起听了 {length} 分钟音乐，遇见了 {len(counts)} 首不同的歌。你停留最多的是《{top['title']}》，它在耳边响起了 {counts[top['id']]} 次。\n\n这一天的音乐带着一点「{mood}」的颜色。那些没来得及说出口的心情，都可以先交给旋律。我会替你记得这些小小的瞬间。"
    else:
        title, body = "留一页，给今天的我们", "今天的音乐故事还没开始。听一首喜欢的歌，或写下此刻的心情；下次翻到这一页时，我们会一起想起今天。"
    weather = latest_weather(day)
    if weather:
        by_city = {}
        for snapshot in get_db().execute("SELECT data FROM weather_snapshots WHERE date = ? ORDER BY id", (day.isoformat(),)):
            snapshot = json.loads(snapshot[0])
            group = by_city.setdefault(snapshot["city"], {"conditions": set(), "temperature": 0, "severe": False})
            group["conditions"].add(snapshot["condition"])
            group["temperature"] = snapshot["temperature"]
            group["severe"] = group["severe"] or snapshot.get("severe", False)
        description = "；".join(f"{city}：{'、'.join(sorted(group['conditions']))}，最近一次 {group['temperature']:g}°C" for city, group in by_city.items())
        body += f"\n\n今天记录到的天气：{description}。"
        if any(group["severe"] for group in by_city.values()) or any(word in description for word in ("大雨", "大雪", "雷雨", "大风")):
            body += "外面的天气有些不安稳，幸好我们还有音乐。愿这些温柔的声音，让你感觉安心一点。"
        elif "雨" in description:
            body += "窗外有雨，耳边有歌，平凡的一天也值得被记下来。"
        elif "晴" in description:
            body += "把阳光和旋律一起，收进今天这一页。"
    upstream = current_app.extensions["kugou"]
    context = context_for_day(get_db(), day, get_profile()["name"])
    story = story_state(get_db(), context, upstream.enabled and not upstream.local_mode)
    return {"date": day.isoformat(), "title": title, "body": story["text"] or body, "story": story, "mood": mood, "minutes": length, "songCount": len(counts), "topSong": top, "note": note[0] if note else "", "isDemo": any(r["is_demo"] for r in rows), "weather": weather}


def report_data(period, offset):
    start, end = period_bounds(period, offset)
    rows = plays_between(start, end)
    songs = {song["id"]: song for song in all_songs()}
    song_seconds, song_plays, day_seconds, mood_seconds, artist_seconds, artist_plays = (Counter() for _ in range(6))
    for row in rows:
        id_, seconds = row["song_id"], row["seconds"]
        song_seconds[id_] += seconds
        day_seconds[row["listened_at"][:10]] += seconds
        mood_seconds[row["mood"]] += seconds
        artist_seconds[songs[id_]["artist"]] += seconds
    for id_, _ in {(r["song_id"], play_identity(r)) for r in rows}:
        song_plays[id_] += 1
        artist_plays[songs[id_]["artist"]] += 1
    total = sum(song_seconds.values())
    top_songs = [{**songs[id_], "plays": song_plays[id_], "minutes": minutes(length)} for id_, length in song_seconds.most_common(5)]
    top_mood = mood_seconds.most_common(1)[0][0] if mood_seconds else "等待记录"
    day = start
    daily = []
    while day <= end:
        daily.append({"date": day.isoformat(), "label": f"{day.month}/{day.day}", "minutes": minutes(day_seconds[day.isoformat()])})
        day += timedelta(days=1)
    previous_start, previous_end = period_bounds(period, offset - 1)
    previous_seconds = sum(r["seconds"] for r in plays_between(previous_start, previous_end))
    trend = []
    for step in range({"week": 7, "month": 6, "year": 5}[period] - 1, -1, -1):
        trend_start, trend_end = period_bounds(period, offset - step)
        trend_rows = plays_between(trend_start, trend_end)
        label = str(trend_start.year) if period == "year" else f"{trend_start.month}月" if period == "month" else f"{trend_start.month}/{trend_start.day}"
        trend.append({"label": label, "minutes": minutes(sum(r["seconds"] for r in trend_rows)), "songCount": len({r["song_id"] for r in trend_rows})})
    monthly_favorites = []
    if period == "year":
        groups = defaultdict(Counter)
        for row in rows:
            groups[int(row["listened_at"][5:7])][row["song_id"]] += row["seconds"]
        for month, counts in sorted(groups.items()):
            id_, count = counts.most_common(1)[0]
            count = len({play_identity(row) for row in rows if int(row["listened_at"][5:7]) == month and row["song_id"] == id_})
            monthly_favorites.append({"month": month, "label": f"{month}月", "song": songs[id_], "plays": count})
    elapsed_days = max(1, (min(end, now().date()) - start).days + 1)
    period_name = {"week": "周", "month": "月", "year": "年"}[period]
    label = f"{start.year}年{start.month}月{start.day}日 — {end.month}月{end.day}日" if period == "week" else f"{start.year}年{start.month}月" if period == "month" else f"{start.year}年"
    favorites = get_db().execute("SELECT count(*) FROM favorites WHERE created_at >= ? AND created_at < ?", (start.isoformat(), (end + timedelta(days=1)).isoformat())).fetchone()[0]
    tags = [mood for mood, _ in mood_seconds.most_common(3)]
    title = f"这一{period_name}，音乐是你的{top_mood}小天地" if rows else "下一段音乐故事，等你开启"
    body = f"{len(day_seconds)} 天有音乐相伴，{minutes(total)} 分钟留给自己。你最常听的{top_mood}旋律，记录着只属于你的生活节奏。" if rows else "这一段时间还没有听歌记录。播放一首音乐后，你的报告就会开始生长。"
    return {
        "period": period, "offset": offset, "label": label, "startDate": start.isoformat(), "endDate": end.isoformat(),
        "isDemo": any(row["is_demo"] for row in rows),
        "summary": {"minutes": minutes(total), "songCount": len(song_seconds), "playCount": sum(song_plays.values()), "activeDays": len(day_seconds), "favoriteCount": favorites, "topMood": top_mood, "companionDays": get_profile()["days"]},
        "comparison": {"minutesPercent": round((total - previous_seconds) / previous_seconds * 100) if previous_seconds else None},
        "daily": daily, "topSongs": top_songs,
        "topArtists": [{"name": artist, "plays": artist_plays[artist], "minutes": minutes(length)} for artist, length in artist_seconds.most_common(5)],
        "moods": [{"name": mood, "percent": round(length / total * 100) if total else 0, "minutes": minutes(length), "color": MOOD_COLORS.get(mood, "#B6A6CD")} for mood, length in mood_seconds.most_common()],
        "tags": tags, "insight": {"title": title, "body": body},
        "highlights": [
            {"title": "音乐陪伴", "value": f"{minutes(total)} 分钟", "description": f"这一{period_name}，留给自己的声音时光"},
            {"title": "心动收藏", "value": f"{favorites} 首", "description": "这一段时间新收藏的音乐"},
            {"title": "专属关键词", "value": top_mood, "description": "从听过的音乐标签中发现你的偏爱"},
            {"title": "有声的日子", "value": f"{len(day_seconds)} 天", "description": "这一段时间与音乐相伴的天数"},
        ],
        "letter": f"亲爱的你：\n\n{body}\n\n谢谢你愿意与我分享耳机里的世界。无论下一首歌是明亮还是安静，我都会在这里，陪你听下去。\n\n一直陪着你的 {get_profile()['name']}",
        "trend": trend, "monthlyFavorites": monthly_favorites,
        "listeningIndex": min(100, round(len(day_seconds) / elapsed_days * 100)), "listeningIndexLabel": "活跃天数 / 周期已过天数",
    }


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("请提交 JSON 对象")
    return body


def valid_text(value, field, limit, allow_empty=False):
    if not isinstance(value, str) or len(value) > limit or (not allow_empty and not value.strip()):
        raise ValueError(f"{field}需为{'0' if allow_empty else '1'}—{limit}字的文字")
    return value.strip()


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATABASE=os.getenv("APP_DATABASE_PATH", str(ROOT / "backend" / "data" / "companion.sqlite3")), SEED_DEMO=os.getenv("SEED_DEMO", "true").lower() in ("true", "1", "yes"), MAX_CONTENT_LENGTH=32 * 1024)
    if test_config:
        app.config.update(test_config)
    app.json.ensure_ascii = False
    init_db(app)
    upstream = KugouClient(mode=app.config.get("PET_CHAT_MODE"))
    app.extensions["kugou"] = upstream

    @app.teardown_appcontext
    def close_db(error=None):
        db = g.pop("db", None)
        if db:
            db.close()

    @app.errorhandler(ValueError)
    def invalid_request(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error={404: "没有找到这个页面或接口", 405: "此接口不支持该请求方式", 413: "提交的内容过长"}.get(error.code, "请求格式不正确")), error.code

    @app.errorhandler(sqlite3.Error)
    def database_error(error):
        app.logger.error("Database request failed: %s", type(error).__name__)
        return jsonify(error="保存暂时失败，请稍后重试"), 503

    @app.after_request
    def response_headers(response):
        if request.path.startswith("/api/") and not request.path.startswith("/api/audio/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/api/health")
    def health():
        get_db().execute("SELECT 1").fetchone()
        return jsonify(status="ok", database="sqlite", mode=upstream.mode(), integration=upstream.integration())

    @app.get("/api/bootstrap")
    def bootstrap():
        greeting = "早上好呀，让音乐叫醒今天的好心情。" if now().hour < 11 else "下午好，给自己留一首歌的时间吧。" if now().hour < 18 else "晚上好，今天辛苦啦，让音乐陪你慢下来。"
        weather = latest_weather()
        return jsonify(profile=get_profile(), songs=all_songs(), greeting=weather["greeting"] if weather else greeting, mode=upstream.mode(), integration=upstream.integration(), isDemo=get_db().execute("SELECT value FROM app_meta WHERE key = 'demo_seeded'").fetchone()[0] == "true", weather=weather)

    @app.get("/api/network")
    def network_access():
        return jsonify(lan_access())

    @app.get("/api/messages")
    def messages():
        id_ = conversation_id(request.args.get("conversationId"))
        return jsonify(conversationId=id_, messages=conversation_messages(id_))

    @app.get("/api/conversations")
    def conversations():
        rows = get_db().execute("""SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count,
            (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) preview
            FROM conversations c ORDER BY c.updated_at DESC, c.id""").fetchall()
        return jsonify(activeConversationId=conversation_id(), conversations=[{
            "id": row["id"], "title": row["title"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
            "messageCount": row["message_count"], "preview": clean_assistant_text(row["preview"] or "还没有消息，聊聊今天吧")[:80]
        } for row in rows])

    @app.post("/api/conversations")
    def new_conversation():
        id_, at = str(uuid.uuid4()), now().isoformat()
        with get_db() as db:
            db.execute("INSERT INTO conversations VALUES (?, '新对话', ?, ?)", (id_, at, at))
            db.execute("UPDATE app_meta SET value=? WHERE key='chat_session_id'", (id_,))
        return jsonify(conversationId=id_, messages=[]), 201

    @app.post("/api/conversations/<id_>/select")
    def select_conversation(id_):
        id_ = conversation_id(id_)
        with get_db() as db:
            db.execute("UPDATE app_meta SET value=? WHERE key='chat_session_id'", (id_,))
        return jsonify(conversationId=id_, messages=conversation_messages(id_))

    @app.get("/api/recommendations")
    def saved_recommendations():
        scene = valid_text(request.args.get("scene", ""), "场景", 40, True)
        row = get_db().execute("SELECT * FROM recommendation_requests WHERE scene = ? AND origin = 'manual' ORDER BY id DESC LIMIT 1", (scene,)).fetchone()
        return jsonify(recommendation_payload(upstream, row))

    @app.post("/api/recommendations")
    def music_recommendations():
        body = json_body()
        scene = valid_text(body.get("scene", ""), "场景", 40, True)
        message = valid_text(body.get("message", "为我推荐适合现在听的歌曲"), "推荐要求", 1000, True)
        if upstream.local_mode:
            return jsonify(error="当前为本地演示模式，请启用模型接口后生成歌曲推荐。", source="kugou-error", integration=upstream.integration()), 503
        if not upstream.enabled:
            error = upstream.fail(upstream.config_error or RemoteError("config", "unconfigured"))
            return jsonify(error=error.public_message, source="kugou-error", integration=upstream.integration()), 503
        try:
            _, payload = generate_recommendation(upstream, scene, message)
        except RemoteError as error:
            upstream.fail(error)
            return jsonify(error=error.public_message, source="kugou-error", integration=upstream.integration()), 502 if error.reason == "no_songs" else 503
        except (KeyError, ValueError, TypeError):
            error = upstream.fail(RemoteError("recommendation", "no_songs"))
            return jsonify(error=error.public_message, source="kugou-error", integration=upstream.integration()), 502
        return jsonify(payload)

    @app.get("/api/recommendations/hourly")
    def hourly_status():
        return jsonify(hourly_recommendation_payload(upstream))

    @app.post("/api/recommendations/hourly")
    def hourly_recommendation():
        attempt_id = claim_hourly_recommendation()
        if not attempt_id:
            return jsonify(hourly_recommendation_payload(upstream))
        error_message, row_id = None, None
        if upstream.local_mode:
            error_message = "当前为本地演示模式，启用模型接口后才会生成主动推荐。"
        elif not upstream.enabled:
            error_message = upstream.fail(upstream.config_error or RemoteError("config", "unconfigured")).public_message
        else:
            try:
                recent = get_db().execute("SELECT scene FROM recommendation_requests WHERE origin = 'manual' AND scene != '' AND created_at >= ? ORDER BY id DESC LIMIT 1", ((now() - timedelta(hours=24)).isoformat(),)).fetchone()
                scene = recent["scene"] if recent else ""
                message = f"现在是用户所在应用时区（UTC+8）的{now():%H:%M}，请主动推荐一首适合此刻、用户最近选择的心情及已分享天气位置的歌曲。"
                row_id, _ = generate_recommendation(upstream, scene, message, origin="hourly")
            except RemoteError as error:
                error_message = upstream.fail(error).public_message
            except (OSError, KeyError, ValueError, TypeError, AttributeError):
                error_message = upstream.fail(RemoteError("recommendation", "no_songs")).public_message
        with get_db() as db:
            # A delayed old worker cannot overwrite a newer hour's attempt.
            db.execute("UPDATE hourly_recommendation SET pending = 0, error = ?, request_id = COALESCE(?, request_id) WHERE id = 1 AND attempt_id = ?", (error_message, row_id, attempt_id))
        return jsonify(hourly_recommendation_payload(upstream))

    @app.post("/api/chat")
    def chat():
        body = json_body()
        session_id = conversation_id(body.get("conversationId"))
        message = valid_text(body.get("message"), "消息", 1000)
        scene = valid_text(body.get("scene", ""), "场景", 40, True)
        result = recommend(message, scene) if upstream.local_mode else {"mood": infer_mood(scene or message)}
        if not upstream.local_mode:
            try:
                query = f"{message}（场景：{scene}）" if scene else message
                weather_context = latest_weather()
                if weather_context:
                    status = "历史缓存，不代表当前天气" if weather_context.get("cached") else "最近获取的天气"
                    query += f"（用户已分享的天气背景：{weather_context['city']}，{weather_context['condition']}，{weather_context['temperature']}°C，天气获取于{weather_context['updatedAt']}，{status}。请按需结合天气关怀和推荐音乐。）"
                history = [dict(row) for row in get_db().execute("SELECT role, content FROM (SELECT id, role, content FROM messages WHERE source = 'kugou' AND conversation_id=? ORDER BY id DESC LIMIT 10) ORDER BY id", (session_id,))]
                for item in history:
                    if item["role"] == "assistant":
                        item["content"] = clean_assistant_text(item["content"])
                remote = upstream.chat(query, history=history, session_id=session_id, recommend=bool(scene) or bool(re.search("推荐|想听|放首|来首|听歌|音乐|歌曲|歌单", message)))
                remote["reply"] = clean_assistant_text(remote["reply"])
                if not remote["reply"]:
                    raise RemoteError("chat", "response")
                result.update(reply=remote["reply"], source="kugou", songs=import_remote_songs(remote["songs"], result["mood"]), quickCommands=remote["quickCommands"])
            except RemoteError as error:
                upstream.fail(error)
                return jsonify(error=error.public_message, source="kugou-error", integration=upstream.integration()), 503
            except (OSError, ValueError, TypeError, KeyError, AttributeError):
                error = upstream.fail(RemoteError("chat", "response"))
                return jsonify(error=error.public_message, source="kugou-error", integration=upstream.integration()), 503
        at = now().isoformat()
        with get_db() as db:
            first_message = not db.execute("SELECT 1 FROM messages WHERE conversation_id=?", (session_id,)).fetchone()
            db.execute("INSERT INTO messages(role, content, created_at, source, conversation_id) VALUES ('user', ?, ?, ?, ?)", (message, at, result["source"], session_id))
            cursor = db.execute("INSERT INTO messages(role, content, songs, created_at, source, conversation_id) VALUES ('assistant', ?, ?, ?, ?, ?)", (result["reply"], json.dumps(result["songs"], ensure_ascii=False), at, result["source"], session_id))
            db.execute("UPDATE conversations SET updated_at=?, title=CASE WHEN ? THEN ? ELSE title END WHERE id=?", (at, first_message, message[:24], session_id))
            result["conversationId"] = session_id
            result["messageId"] = cursor.lastrowid
        return jsonify({**result, "integration": upstream.integration()})

    @app.post("/api/play")
    def play():
        body = json_body()
        id_ = valid_text(body.get("songId"), "歌曲编号", 200)
        seconds = body.get("seconds")
        if isinstance(seconds, bool) or not isinstance(seconds, int) or not 1 <= seconds <= 3600:
            raise ValueError("听歌时长需为 1—3600 秒的整数")
        event_id = body.get("eventId")
        if event_id is not None:
            event_id = valid_text(event_id, "播放记录编号", 120)
        session_id = body.get("sessionId")
        if session_id is not None:
            session_id = valid_text(session_id, "播放会话编号", 120)
            previous = get_db().execute("SELECT song_id FROM plays WHERE session_id = ? LIMIT 1", (session_id,)).fetchone()
            if previous and previous[0] != id_:
                return jsonify(error="播放会话已用于其他歌曲"), 409
        song = get_db().execute("SELECT tags FROM songs WHERE id = ?", (id_,)).fetchone()
        if not song:
            return jsonify(error="歌曲不存在"), 404
        mood = json.loads(song["tags"])[0]
        with get_db() as db:
            existing = db.execute("SELECT song_id, seconds FROM plays WHERE event_id = ?", (event_id,)).fetchone() if event_id else None
            if existing and (existing["song_id"] != id_ or existing["seconds"] != seconds):
                return jsonify(error="播放记录编号已用于其他记录"), 409
            if not existing:
                db.execute("INSERT INTO plays(song_id, seconds, listened_at, mood, event_id, session_id) VALUES (?, ?, ?, ?, ?, ?)", (id_, seconds, now().isoformat(), mood, event_id, session_id))
                db.execute("UPDATE profile SET energy = min(1600, energy + ?) WHERE id = 1", (max(1, seconds // 30),))
        return jsonify(profile=get_profile(), diary=diary_entry(now().date()), recorded=not bool(existing))

    @app.get("/api/diary")
    def diary():
        dates = {row[0] for row in get_db().execute("SELECT DISTINCT substr(listened_at, 1, 10) FROM plays UNION SELECT date FROM diary_notes UNION SELECT date FROM weather_snapshots UNION SELECT substr(created_at, 1, 10) FROM messages UNION SELECT substr(created_at, 1, 10) FROM recommendation_requests UNION SELECT date FROM diary_stories")}
        dates.add(now().date().isoformat())
        entries = [diary_entry(date.fromisoformat(day)) for day in sorted(dates, reverse=True)]
        return jsonify(entries=entries, total=len(entries))

    @app.post("/api/diary/<day>/story")
    def write_diary_story(day):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            raise ValueError("日期格式应为 YYYY-MM-DD")
        parsed = date.fromisoformat(day)
        if parsed > now().date() or parsed.year < 2000:
            raise ValueError("日记日期需为 2000 年以后且不能晚于今天")
        entry = diary_entry(parsed)
        if not entry["story"]["canGenerate"] or not entry["story"]["stale"]:
            return jsonify(entry=entry)
        context = context_for_day(get_db(), parsed, get_profile()["name"])
        try:
            if not generate_story(get_db(), upstream, context, now()):
                return jsonify(error="这一天的回忆正在整理，请稍后再试。"), 409
        except (RemoteError, OSError, ValueError, TypeError, KeyError, AttributeError) as cause:
            error = cause if isinstance(cause, RemoteError) else RemoteError("chat", "response")
            upstream.fail(error)
            return jsonify(error="专属回忆暂未写好，原有记录已保留。" + error.public_message), 503
        return jsonify(entry=diary_entry(parsed))

    @app.put("/api/diary/<day>")
    def save_diary(day):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
            raise ValueError("日期格式应为 YYYY-MM-DD")
        try:
            parsed = date.fromisoformat(day)
        except ValueError:
            raise ValueError("日记日期无效") from None
        if parsed > now().date() or parsed.year < 2000:
            raise ValueError("日记日期需为 2000 年以后且不能晚于今天")
        note = valid_text(json_body().get("note"), "日记", 4000, True)
        with get_db() as db:
            db.execute("INSERT INTO diary_notes VALUES (?, ?) ON CONFLICT(date) DO UPDATE SET note=excluded.note", (day, note))
        return jsonify(entry=diary_entry(parsed))

    @app.get("/api/reports")
    def reports():
        period = request.args.get("period", "week")
        if period not in ("week", "month", "year"):
            raise ValueError("报告周期应为 week、month 或 year")
        raw_offset = request.args.get("offset", "0")
        if not re.fullmatch(r"-?\d{1,3}", raw_offset):
            raise ValueError("报告偏移量需为整数")
        offset = int(raw_offset)
        if not -60 <= offset <= 0:
            raise ValueError("报告偏移量需在 -60 到 0 之间")
        return jsonify(report_data(period, offset))

    @app.post("/api/favorites")
    def favorites():
        body = json_body()
        id_ = valid_text(body.get("songId"), "歌曲编号", 200)
        if not get_db().execute("SELECT 1 FROM songs WHERE id = ?", (id_,)).fetchone():
            return jsonify(error="歌曲不存在"), 404
        existing = bool(get_db().execute("SELECT 1 FROM favorites WHERE song_id = ?", (id_,)).fetchone())
        desired = body.get("favorite", not existing)
        if not isinstance(desired, bool):
            raise ValueError("favorite 需为布尔值")
        with get_db() as db:
            if desired:
                db.execute("INSERT OR IGNORE INTO favorites VALUES (?, ?)", (id_, now().isoformat()))
            else:
                db.execute("DELETE FROM favorites WHERE song_id = ?", (id_,))
        return jsonify(songId=id_, favorite=desired)

    @app.post("/api/profile")
    def profile():
        name = valid_text(json_body().get("name"), "名字", 16)
        with get_db() as db:
            db.execute("UPDATE profile SET name = ? WHERE id = 1", (name,))
        return jsonify(profile=get_profile())

    @app.post("/api/feed")
    def feed():
        with get_db() as db:
            cursor = db.execute("INSERT OR IGNORE INTO feed_events VALUES (?, ?)", (now().date().isoformat(), now().isoformat()))
            fed = cursor.rowcount > 0
            if fed:
                db.execute("UPDATE profile SET energy = min(1600, energy + 40) WHERE id = 1")
        return jsonify(profile=get_profile(), message="吃饱啦！今天的陪伴能量 +40，谢谢你记得我。" if fed else "今天已经吃饱啦，再陪我听一首歌吧。")

    @app.get("/api/location/search")
    def locations():
        query = valid_text(request.args.get("q"), "城市名", 80)
        try:
            return jsonify(results=search_locations(query))
        except (OSError, ValueError, KeyError, TypeError):
            return jsonify(error="城市搜索暂时连接不上，请稍后重试"), 503

    @app.post("/api/weather")
    def weather():
        body = json_body()
        latitude, longitude = body.get("latitude"), body.get("longitude")
        for value, limit, name in ((latitude, 90, "纬度"), (longitude, 180, "经度")):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not -limit <= value <= limit:
                raise ValueError(f"{name}无效")
        city = valid_text(body.get("city", "你所在的位置"), "城市名", 80)
        try:
            result = store_weather(get_weather(latitude, longitude, city))
            return jsonify(result)
        except (OSError, ValueError, KeyError, TypeError):
            cached = get_db().execute("SELECT data FROM weather_snapshots WHERE abs(latitude - ?) < 0.05 AND abs(longitude - ?) < 0.05 ORDER BY id DESC LIMIT 1", (latitude, longitude)).fetchone()
            if cached:
                result = json.loads(cached[0])
                mark_cached_weather(result)
                result["notice"] = "天气接口暂时连接不上，显示上次获取的天气。"
                return jsonify(result)
            return jsonify(error="天气服务暂时连接不上，请稍后重试。未生成或保存虚拟天气。"), 503

    @app.get("/api/audio/<id_>.wav")
    def audio(id_):
        song = get_db().execute("SELECT audio_seed FROM songs WHERE id = ?", (id_,)).fetchone()
        if not song or song["audio_seed"] is None:
            return jsonify(error="这首歌暂时没有试听音源"), 404
        return send_file(BytesIO(generate_preview(song["audio_seed"])), mimetype="audio/wav", download_name=id_ + ".wav", conditional=True, max_age=86400)

    @app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    @app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    def unknown_api(path):
        return jsonify(error="接口不存在"), 404

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def frontend(path):
        dist = ROOT / "dist"
        if path and (dist / path).is_file():
            return send_from_directory(dist, path)
        if (dist / "index.html").is_file():
            return send_from_directory(dist, "index.html")
        return jsonify(message="后端已启动；开发预览请启动 npm run dev，或先运行 npm run build。"), 200

    return app


if __name__ == "__main__":
    create_app().run(host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
